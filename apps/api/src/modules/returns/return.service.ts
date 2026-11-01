import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {OrderStatus,Prisma,ReturnCondition,ReturnReason,ReturnStatus} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service';
import {NotificationService} from '../notifications/notification.service';

const transitions:Record<ReturnStatus,ReturnStatus[]>={REQUESTED:['APPROVED','REJECTED','CANCELLED'],APPROVED:['PICKED_UP','CANCELLED'],PICKED_UP:['RECEIVED'],RECEIVED:['INSPECTED'],INSPECTED:['REFUND_ELIGIBLE','REJECTED'],REFUND_ELIGIBLE:['COMPLETED'],COMPLETED:[],REJECTED:[],CANCELLED:[]};

@Injectable()
export class ReturnService {
 constructor(private readonly prisma:PrismaService, private readonly notifications:NotificationService){}
 async request(orderId:string,userId:string,reason:ReturnReason,items:Array<{orderItemId:string;quantity:number}>,notes?:string,evidenceUrl?:string){
  if (!items.length) throw new BadRequestException({error:'RETURN_ITEMS_REQUIRED'});
  return this.prisma.$transaction(async tx=>{
   const order=await tx.order.findUnique({where:{id:orderId},include:{items:true}});
   if(!order||order.userId!==userId) throw new NotFoundException({error:'ORDER_NOT_FOUND'});
   if(order.status!== 'DELIVERED') throw new BadRequestException({error:'RETURN_NOT_ELIGIBLE'});
   const existing=await tx.return.findFirst({where:{orderId,userId,status:{in:['REQUESTED','APPROVED','PICKED_UP','RECEIVED','INSPECTED','REFUND_ELIGIBLE']}}});
   if(existing) throw new BadRequestException({error:'RETURN_ALREADY_ACTIVE'});
   const locked=await tx.$queryRaw<Array<{id:string;quantity:number}>>`SELECT id, quantity FROM order_items WHERE order_id=${orderId} AND id IN (${Prisma.join(items.map(i=>i.orderItemId))}) FOR UPDATE`;
   if(locked.length!==items.length) throw new BadRequestException({error:'RETURN_ITEM_NOT_FOUND'});
   for(const i of items){if(i.quantity<=0)throw new BadRequestException({error:'INVALID_RETURN_QUANTITY'});const [row]=await tx.$queryRaw<Array<{purchased:number;returned:number}>>`SELECT oi.quantity AS purchased, COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=oi.id AND r.status NOT IN ('REJECTED','CANCELLED','COMPLETED')),0)::int AS returned FROM order_items oi WHERE oi.id=${i.orderItemId} FOR UPDATE`;if(!row||i.quantity>row.purchased-row.returned)throw new BadRequestException({error:'RETURN_QUANTITY_EXCEEDED'});}
   const [seq]=await tx.$queryRaw<Array<{value:bigint}>>`SELECT nextval('return_number_seq') value`;
   const created = await tx.return.create({data:{returnNumber:`RET-${String(Number(seq.value)).padStart(6,'0')}`,orderId,userId,reason,notes,evidenceUrl,items:{create:items.map(i=>({orderItemId:i.orderItemId,quantity:i.quantity}))}} ,include:{items:true}});
   const orderTransition = await tx.order.updateMany({
    where:{id:orderId,status:OrderStatus.DELIVERED},
    data:{status:OrderStatus.RETURN_REQUESTED}
   });
   if(orderTransition.count!==1) throw new BadRequestException({error:'RETURN_ORDER_STATE_CHANGED'});
   await tx.orderStatusHistory.create({
    data:{
     orderId,
     oldStatus:OrderStatus.DELIVERED,
     newStatus:OrderStatus.RETURN_REQUESTED,
     reason:'CUSTOMER_RETURN_REQUESTED',
     changedBy:userId
    }
   });
   await this.notifications.enqueueReturnStatus(created.id, orderId, ReturnStatus.REQUESTED, tx);
   return created;
  });
 }
 async listForUser(userId:string,readAll=false){return this.prisma.return.findMany({where:readAll?undefined:{userId},include:{items:true,refunds:true},orderBy:{createdAt:'desc'}})}
 async transition(
  id:string,
  status:ReturnStatus,
  staffNotes?:string,
  inspection?:Array<{returnItemId:string;condition:ReturnCondition}>,
 ){
  return this.prisma.$transaction(async tx=>{
   const locked=await tx.$queryRaw<Array<{id:string;status:ReturnStatus;staff_notes:string|null}>>`
     SELECT id,status,staff_notes FROM returns WHERE id=${id} FOR UPDATE
   `;
   const r=locked[0];
   if(!r) throw new NotFoundException({error:'RETURN_NOT_FOUND'});
   if(!transitions[r.status].includes(status)) throw new BadRequestException({error:'INVALID_RETURN_TRANSITION'});
   if(status===ReturnStatus.COMPLETED) {
    throw new BadRequestException({error:'REFUND_COMPLETION_MANAGED_BY_REFUND_SERVICE'});
   }

   const items=await tx.returnItem.findMany({where:{returnId:id},select:{id:true,orderItemId:true,quantity:true,condition:true}});
   if(status===ReturnStatus.INSPECTED){
    if(!inspection || inspection.length!==items.length) throw new BadRequestException({error:'RETURN_INSPECTION_REQUIRED'});
    const inspectionById=new Map(inspection.map(i=>[i.returnItemId,i.condition]));
    if(inspectionById.size!==items.length || items.some(i=>!inspectionById.has(i.id))) throw new BadRequestException({error:'RETURN_INSPECTION_INCOMPLETE'});
    for(const item of items){
     const condition=inspectionById.get(item.id)!;
     await tx.returnItem.update({where:{id:item.id},data:{condition}});
    }
   }
   if(status===ReturnStatus.REFUND_ELIGIBLE){
    if(items.some(item=>item.condition===null)) throw new BadRequestException({error:'RETURN_INSPECTION_REQUIRED'});
    for(const item of items){
     if(item.condition!==ReturnCondition.SEALED_INTACT) continue;
     const [inventory]=await tx.$queryRaw<Array<{variant_id:string}>>`
      SELECT oi.variant_id FROM order_items oi WHERE oi.id=${item.orderItemId} FOR UPDATE
     `;
     if(!inventory?.variant_id) throw new BadRequestException({error:'RETURN_INVENTORY_VARIANT_MISSING'});
     const restocked=await tx.$executeRaw`
      UPDATE inventory
      SET quantity_available=quantity_available+${item.quantity}, version=version+1, updated_at=NOW()
      WHERE variant_id=${inventory.variant_id}
     `;
     if(restocked!==1) throw new BadRequestException({error:'RETURN_INVENTORY_MISSING'});
     await tx.inventoryMovement.create({data:{variantId:inventory.variant_id,delta:item.quantity,reason:'RESTOCK_RETURN',referenceId:item.id}});
    }
   }
   const updated = await tx.return.update({
    where:{id},
    data:{status,staffNotes:staffNotes??r.staff_notes??undefined,resolvedAt:['COMPLETED','REJECTED','CANCELLED'].includes(status)?new Date():undefined},
    include:{items:true}
   });
   const returnRecord = await tx.return.findUniqueOrThrow({where:{id},select:{orderId:true}});
   if(status===ReturnStatus.REJECTED || status===ReturnStatus.CANCELLED) {
    const restoredOrder = await tx.order.updateMany({
     where:{id:returnRecord.orderId,status:OrderStatus.RETURN_REQUESTED},
     data:{status:OrderStatus.DELIVERED}
    });
    if(restoredOrder.count===1) {
     await tx.orderStatusHistory.create({
      data:{
       orderId:returnRecord.orderId,
       oldStatus:OrderStatus.RETURN_REQUESTED,
       newStatus:OrderStatus.DELIVERED,
       reason:status===ReturnStatus.REJECTED?'RETURN_REJECTED':'RETURN_CANCELLED',
       changedBy:'RETURN_WORKFLOW'
      }
     });
    }
   }
   await this.notifications.enqueueReturnStatus(id, returnRecord.orderId, status, tx);
   return updated;
  });
 }
}