# India Post CEPt integration onboarding

Last reviewed: 2026-11-02

## Current status

No private CEPt credentials, Customer ID, approval, UAT access, or production access have been obtained by this project. The current shipping endpoint validates PIN syntax only and intentionally reports serviceability as unverified. The public references located are dated 2021 and must not be treated as a current production API contract.

## 2026 public-information update

The Department of Posts reported on 11 March 2026 that APT 2.0 had introduced real-time delivery updates, OTP-based delivery and API integration with e-commerce partners. This confirms that API integration is an active capability area, but the public announcement does not publish the current merchant onboarding steps, credentials, UAT URLs, authentication contract or API schemas. The 2021 CEPt API guide must therefore be treated as historical technical material, not as an implementation specification.

The current India Post product catalogue distinguishes several services that should not be conflated:

- **Speed Post Parcel (Domestic):** separate retail and contractual tariff structures; the current published page states parcel limits up to 35 kg (gross or volumetric weight as defined), contractual-customer facilities and tariff effective 01 August 2026. It publishes indicative average service standards, not a guarantee for an individual shipment.
- **India Post Parcel (Contractual):** intended for customers entering into an agreement with the Department of Posts; the current product page describes up to 35 kg subject to dimensions, tracking, eligible pickup, volume discounts and COD up to ₹50,000.
- **India Post Parcel Last Mile:** a separate last-mile offering described for bulk/contractual customers, with local-jurisdiction induction and a 5 kg maximum. It is not a nationwide substitute for the other parcel products.

The merchant must select the actual product/service with the Department of Posts. Do not hard-code retail tariffs, 2021 endpoints or product eligibility from public web pages into the store. Tariffs, availability and delivery estimates need a current approved contract/API response and the merchant's applicable customer agreement.

## Department of Posts onboarding route

The Department of Posts public SOP, “SOP of API integration Process for on boarding of E-Commerce Customers” (04 August 2021), describes the sequence below. As of this review, I found no newer public merchant onboarding SOP that supersedes it. Because APT 2.0 was introduced subsequently, the Circle/Division/CEPT teams must confirm whether this workflow, portal and contact are still used for new integrations:

1. The prospective e-commerce customer approaches a Department of Posts Circle sales/Marketing Executive (ME).
2. The ME shares the latest API approach document from the CEPt API portal.
3. The customer requests integration through the ME after reviewing the document.
4. The ME raises the request to the Circle/Division office, which raises an Integration Request Ticket through HDMS.
5. The ticket captures customer name, postal services required/proposed, contact number, integration mode (API/SFTP), Department of Posts Customer ID, and customer public IP. The ME's registered email is included for correspondence.
6. CEPT contacts the customer with testing tasks and timelines. Progress is tracked against the HDMS request.
7. After successful testing, CEPT closes the ticket and records the production rollout date.

Historical portal / HDMS entry point in the 2021 SOP: https://cept.gov.in/apiintegration/login.aspx

The 2021 SOP lists salesndist.cept@indiapost.gov.in for Circle-level operational difficulty initiating a ticket. Confirm the current portal and mailbox through the Circle ME/official India Post contact directory before sending a request.

The SOP assigns ticket initiation to the Circle/Division office. A local Post Office manager can help connect the merchant to the Circle ME and the relevant Division/Circle office, but we must not assume the manager can independently approve API access or whitelist an IP.

## Prepare for the meeting

- Registered legal business name and business contact details.
- Department of Posts Customer ID, if already issued; otherwise ask which customer registration/contract path applies.
- Ask the Circle/Business Development team to confirm the appropriate current service (for example Speed Post Parcel contractual or India Post Parcel (Contractual)) and the correct customer contract/booking channel.
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
10. Does the APT 2.0 integration team provide a new API portal, onboarding SOP, technical documentation or sandbox that supersedes the 2021 CEPT guide?
11. Which exact parcel product is contracted (Speed Post Parcel, India Post Parcel (Contractual), or another service), and what are the applicable pickup, COD, insurance, delivery-area and return capabilities?
12. Are tariff, PIN validation, route/serviceability and estimated-delivery responses authoritative for this merchant's contracted product, origin office and actual package profile?

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
- CEPt “DoP Integration with Bulk Customers v9” (10 November 2021; historical/subject to confirmation): https://cept.gov.in/apiintegration/pdf/DOP_Bulk%20Customer%20Integration_v9.pdf
- PIB, Department of Posts APT 2.0 and e-commerce API integration update (11 March 2026): https://www.pib.gov.in/PressReleasePage.aspx?PRID=2238372&lang=1&reg=6
- India Post Speed Post Parcel (Domestic) product and current tariff/service details: https://www.indiapost.gov.in/mail%26Parcel/mailproducts/domesticservices/speedpostparceldomestic
- India Post Parcel (Contractual): https://www.indiapost.gov.in/mailproducts/premiumservices/businessparcel
- India Post Parcel Last Mile: https://www.indiapost.gov.in/mailproducts/domesticservices/indiapostparcellastmile
- India Post FAQs for 24/48 Speed Post, including bulk API note: https://www.indiapost.gov.in/speedpost/faqs
- India Post contact directory (updated 19 May 2026 in the copy reviewed): https://www.indiapost.gov.in/contactus

Current public sources confirm APT 2.0 and the published parcel product catalogue, but they do not disclose a current merchant API contract or sandbox credentials. The 2021 SOP/API guide is historical. CEPT must confirm the current onboarding process, contract, versions, endpoints, data formats, authentication, IP controls, testing process and contacts before any adapter is implemented or enabled.