import { redirect } from 'next/navigation';

/**
 * The authenticated order page is the source of tracking details.
 * Keep this route as an explicit compatibility alias for policy/support links.
 */
export default function TrackingPage() {
  redirect('/account/orders');
}
