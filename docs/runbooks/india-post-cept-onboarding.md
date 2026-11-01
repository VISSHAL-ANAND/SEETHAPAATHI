# India Post CEPt integration onboarding

Last reviewed: 2026-11-01

## Current status

No private CEPt credentials, Customer ID, approval, UAT access, or production access have been obtained by this project. The current shipping endpoint validates PIN syntax only and intentionally reports serviceability as unverified. The public references located are dated 2021 and must not be treated as a current production API contract.

## Department of Posts onboarding route

The Department of Posts SOP, “SOP of API integration Process for on boarding of E-Commerce Customers” (04 August 2021), describes this sequence:

1. The prospective e-commerce customer approaches a Department of Posts Circle sales/Marketing Executive (ME).
2. The ME shares the latest API approach document from the CEPt API portal.
3. The customer requests integration through the ME after reviewing the document.
4. The ME raises the request to the Circle/Division office, which raises an Integration Request Ticket through HDMS.
5. The ticket captures customer name, postal services required/proposed, contact number, integration mode (API/SFTP), Department of Posts Customer ID, and customer public IP. The ME's registered email is included for correspondence.
6. CEPT contacts the customer with testing tasks and timelines. Progress is tracked against the HDMS request.
7. After successful testing, CEPT closes the ticket and records the production rollout date.

Portal / HDMS entry point: https://cept.gov.in/apiintegration/login.aspx

For operational difficulty initiating a ticket, the SOP lists salesndist.cept@indiapost.gov.in.

The SOP assigns ticket initiation to the Circle/Division office. A local Post Office manager can help connect the merchant to the Circle ME and the relevant Division/Circle office, but we must not assume the manager can independently approve API access or whitelist an IP.

## Prepare for the meeting

- Registered legal business name and business contact details.
- Department of Posts Customer ID, if already issued; otherwise ask which customer registration/contract path applies.
- Required postal products (for example Speed Post and/or Business Parcel).
- Required capabilities only: PIN/office validation, route/tariff checks, booking/manifest, pickup, tracking events, cancellation, etc.
- Requested integration mode (API or SFTP).
- Static public egress IP address(es) of the deployed backend. Do not provide a temporary laptop/home IP as the production IP.
- Technical contact name, email, phone, and availability for testing.
- Merchant dispatch/origin PIN and expected parcel weight/dimension ranges; confirm exact units and mandatory fields with CEPT.
- Callback/webhook URL and static IP only if the selected service requires them.

Never send passwords, client secrets, tokens, or private keys in ordinary email or commit them to the repository. Use CEPT's approved credential exchange process.

## Questions for CEPT

1. What is the current API document/version and approved UAT/production base URLs?
2. Is the merchant eligible, and is a Customer ID, contract, or corporate/BNPL arrangement required?
3. Which API provides PIN validation versus route-level serviceability, tariff, and delivery estimates?
4. Does route/tariff checking require origin PIN, destination PIN, service code, weight, and dimensions? Confirm field names, units, limits, and validation rules.
5. What authentication, credential lifecycle, rate limits, timeout expectations, and IP allowlisting process apply?
6. Are UAT and production IP allowlists separate?
7. What response fields distinguish available, unavailable, invalid PIN, and temporary failure?
8. What UAT test cases, certification criteria, support contact, and production rollout approvals are required?
9. If tracking or booking callbacks are needed, what authentication, retry, delivery guarantee, and source IP ranges apply?

## Implementation gate

Do not call guessed endpoints or build against old sample payloads. Once CEPT supplies the current contract and UAT access:

1. Archive the approved specification and redacted sample requests/responses (never credentials or personal data).
2. Confirm the merchant origin PIN and package profile with the business.
3. Implement a server-side adapter with strict response validation, bounded timeouts, safe caching, redacted logs, and fail-closed behavior.
4. Keep PIN validity separate from route serviceability. A delivery-office record alone does not prove the selected postal product can deliver from the merchant's origin.
5. Test available, unavailable, invalid PIN, malformed response, timeout, authentication failure, and upstream outage.
6. Complete UAT and record evidence before production enablement.
7. Keep live serviceability disabled until CEPT confirms production access and IP allowlisting.

## Public references

- Department of Posts SOP (04 August 2021): https://utilities.cept.gov.in/dop/pdfbind.ashx?id=5778
- CEPt “DoP Integration with Bulk Customers v9” (10 November 2021): https://cept.gov.in/apiintegration/pdf/DOP_Bulk%20Customer%20Integration_v9.pdf
- India Post contact directory: https://www.indiapost.gov.in/contactus

These are public references, not confirmation that the 2021 contract remains current. CEPT must confirm current process, versions, endpoints, and contacts.