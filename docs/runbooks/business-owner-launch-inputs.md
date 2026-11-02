# Business-owner launch inputs and approvals

This checklist separates information the development team can validate from business facts and approvals that only the owner/authorized professionals can provide. Do not substitute example values from this repository.

## A. Legal entity and statutory disclosures

Provide verified current documents/values for:

- Registered legal entity name and trade name.
- Company/LLP/other registration type and number, only if it is applicable and should be displayed.
- Registered office address.
- GSTIN and the corresponding GST state code.
- FSSAI licence/registration number and the licensed business/premises details applicable to the products sold.
- Actual designated grievance officer name and role.
- Monitored privacy, legal, grievance and customer support email addresses.
- Verified support phone and WhatsApp number.

The storefront `NEXT_PUBLIC_*` disclosure values and API `SELLER_*` invoice values must describe the same legal entity/address wherever the same disclosure is represented. An accountant/company secretary/legal advisor should confirm the correct statutory values before they are published or used on invoices.

## B. Tax, product and pricing approval

- Confirm GST registration status, applicable HSN codes and tax rates for every product/category.
- Have the configured tax rates reviewed by the business tax professional.
- Confirm whether the storefront's current ₹50 shipping charge below a ₹500 post-discount merchandise threshold is the approved customer-facing policy.
- Confirm product weights, dimensions, ingredient declarations, allergen statements, nutrition/health claims and shelf-life/storage instructions.
- Confirm that all product photographs, brand marks, packaging and marketing claims are owned or licensed for this store.

Do not assume that a working tax calculation proves the tax configuration is legally correct.

## C. Returns, refunds and customer support

Approve the real business policy for:

- Return request window and how it is calculated.
- Eligible reasons and item conditions.
- Whether sealed food items may be returned and how damaged/incorrect/missing orders are handled.
- Who approves a return/refund and what evidence is required.
- Refund method and customer-facing timing language.
- Support operating hours and expected response times.
- Whether email-only customer notifications are acceptable at launch, since automatic SMS/WhatsApp notifications are not implemented.

The current website copy intentionally avoids promising a 7-day return entitlement, 24-hour replacement or 24-hour refund initiation. These must not be reintroduced unless the business can operationally honour the approved policy and legal review supports it.

## D. Domain and hosting

After the domain is purchased and hosting is selected, provide:

- Registered domain and chosen canonical hostname.
- Hosting provider and exact public API/web service URLs.
- Canonical HTTPS storefront origin.
- Internal API URL reachable by the web service at build/runtime.
- Exact trusted storefront origins for CORS and uploads.
- Static production API egress IP only if an external provider such as India Post requires allowlisting.
- Storage plan: current Compose/Render arrangements are single-instance persistent-disk/local-volume patterns. Multi-host/serverless media requires shared object storage.

DNS records and certificates must be copied from the selected registrar/hosting provider dashboard. Do not guess DNS record values.

## E. Provider credentials and accounts

Configure secrets in the hosting provider's secret manager, never in Git or this checklist:

- Production PostgreSQL connection and backup/restore access.
- Production Redis connection and credentials.
- Unique production JWT secret.
- Razorpay live key ID, secret and webhook secret.
- Resend API key and verified sender/domain.
- Initial admin bootstrap password, then rotate/remove it after the first verified admin login.
- Any approved object storage credentials if shared media storage is selected.

Run controlled test-mode payment/refund flows in staging before enabling live Razorpay keys.

## F. India Post / CEPT

Obtain through the official Circle/Division/CEPT route:

- Written confirmation of the merchant's eligible postal product and required customer agreement/Customer ID.
- Current APT 2.0/CEPT API documentation and approved UAT/production URLs.
- Authentication, credential exchange, IP allowlisting, rate limits and callback requirements.
- Sandbox/UAT access and test cases.
- Merchant dispatch/origin PIN and the actual package weight/dimension profile.
- Confirmation of which API covers PIN validation, route/serviceability, tariffs, booking, labels, cancellation and tracking.

A local Post Office manager may help connect the merchant with the Circle/Division/Business Development team. Do not assume the manager alone can approve integration, issue credentials, or whitelist a server IP. Do not enable the live adapter based only on public or 2021-era sample endpoints.

## G. Final sign-off

Before production DNS cutover, the owner should approve:

- [ ] Legal identity, GSTIN, FSSAI and contact disclosures.
- [ ] Tax/HSN configuration and invoice output.
- [ ] Product ingredient/allergen and marketing claims.
- [ ] Shipping rates and delivery wording.
- [ ] Return/refund policy and customer-support commitments.
- [ ] Domain, host, DNS and same-origin API routing.
- [ ] Live payment and webhook test plan.
- [ ] Backup/restore evidence, alert routing and incident contact.
- [ ] Final staging evidence and exact commit SHA to be deployed.

The engineering team must retain a written record of this approval and the exact production commit. A successful CI run alone is not business, legal, tax or carrier approval.
