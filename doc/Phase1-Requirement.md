# Phase 1 Requirement

The core objective of Phase 1 is to establish a secure, stable, and scalable virtual asset payment technology system. Through this system, merchants can create payment orders and generate payment QR codes or links based on various virtual assets and their respective blockchain networks, while payers can complete on-chain payments via compatible wallets.

In principle, Phase 1 focuses on building the virtual asset payment technology infrastructure and does not include virtual asset trading, fiat currency payments, customer asset custody, transaction matching, asset management, lending, or other regulated financial services.

The business model, fund flow, roles, permissions, and revenue rules for Phase 1 are defined in [Business-Model.md](Business-Model.md). Wallet architecture and regulatory scope remain subject to the system architecture document and the client's legal and compliance advisors.

## III. Phase 1 Business Scope

Company B will perform the following product design, development, and technology implementation tasks.

### 3.1 Accounts, Organization, Roles, and Management Functions

Company B must implement the account hierarchy, roles, permissions, and audit rules defined in [Business-Model.md](Business-Model.md) (including the **Terminology** section). Product and UI must use the canonical terms there; deprecated names (sub-merchant, branch, location account, sub-agent account, reader, guest invoice, etc.) must not appear in user-facing copy.

**Organization hierarchy (org account types)**

1. **Platform** at the root; **agent account** nodes under Platform only (or nested under another agent, shown as **agent (sub) account** when parent context matters). **Platform Owner** configures **max agent depth** globally (Phase 1 default: **2** — agent account → agent (sub) account → merchant account).
2. **Merchant account** (single-location or multi-location structure) under an agent account, or under Platform when no external agent is assigned (platform acts as channel).
3. **Merchant (site) account** (multi-location merchants only) and **Cashier** users under merchant accounts only; no agent accounts under merchants.
4. Agent portal and merchant portal (separate apps or role-based shells) with tree-scoped data visibility.

**User roles (inside each org account)**

5. On the **Platform** org account: **Owner**, **Administrator**, **Viewer**. On agent, merchant, and merchant (site) accounts: **Owner**, **Administrator**, **Viewer**; on merchant and merchant (site) accounts only: **Cashier**.
6. **Owner** may add and remove **Administrator** and **Viewer** on Platform, agent, merchant, and merchant (site) accounts; **Administrator cannot** add or remove team members.
7. **Cashier** may create and manage **own payment orders** only; cannot change settlement address, xPub, fee rates, or org settings.
8. Users on **agent accounts** (Owner/Administrator) may onboard merchants and agent (sub) accounts within depth limit, set volume fee **within platform bands**, and view subtree volume and service bills — **read-only** on merchant credentials and settlement settings; **agent accounts must not create payment orders for merchants**.
9. **Merchant Owner/Administrator** may manage org settings, view all Cashiers in the merchant account, and create payment orders; **merchant (site) Owner/Administrator** creates payment orders for that site and sees that site's data only (unless parent role scope applies).
10. Merchant (site) settings (wallet address, xPub, payment matching mode, order delete period) **inherit parent merchant defaults**; overrides require **merchant Owner** approval. Platform Owner may override for compliance only (logged).

**Payment orders vs service bills**

11. **Payment order** — customer collection; created by merchant, merchant (site), or Cashier; payer sends funds to **merchant wallet** (non-custodial, 100% to merchant).
12. **Service bill** — SaaS subscription plus volume fee on confirmed payment-order volume; system-generated per billing period; payable via separate checkout (QR code, payment link, or agreed off-platform settlement) to the **platform billing wallet**; not deducted from payer on-chain payments.
13. Merchant, merchant (site), and agent portals show applicable **service bills** in their own UI; agent accounts view service bill data across their subtree.

**Platform fee policy**

14. Tiered pricing by merchant size (Small / Mid / Enterprise): subscription plus volume fee band; default small-tier ceiling **2%**; see [Business-Model.md](Business-Model.md).
15. Platform Owner sets global tiers, subscription amounts, min/max volume fee bands, and **max agent nesting depth** (Phase 1 default **2**); Platform Owner/Administrator may onboard agents and manage service bills; agent-account administrators assign merchant rate **within band**; Enterprise custom rates require **Platform Owner** approval; fee changes apply to the **next billing period**.
16. **Agent commission (default):** paid by the platform as a rebate from collected platform fees; optional merchant-paid agent fee only under signed enterprise contracts.

**Core account functions**

17. Merchant and agent account registration, login, and identity verification (scope of KYC/KYB to be confirmed separately).
18. Merchant and agent API keys, webhooks, and security settings (scoped by role).
19. Setting up and managing merchant payment receive addresses and optional xPub (per [Phase1-Project-Plan.md](Phase1-Project-Plan.md) matching modes).
20. Viewing transaction history, order status, payment data, and service bill statements; exporting reports scoped to org tree.
21. **Platform administration backend:** agent and merchant management, global fee tier configuration, **max agent nesting depth**, billing wallet, compliance override, immutable audit log review.
22. **Immutable audit log:** all login and privileged actions recorded append-only; no user may delete audit records.

Whether the merchant KYC/KYB verification function is included in the Phase 1 business scope will be determined based on the final product requirements document confirmed by both parties.

### 3.2 Access to Virtual Assets and Blockchain Networks

Party B must access the designated virtual assets and corresponding blockchain networks in accordance with the final "List of Access to Virtual Assets and Networks" confirmed by both parties.

Each virtual asset must clearly specify the following:

1. Virtual asset name and token contract address
2. Blockchain network used
3. Supported recipient address formats
4. Number of block acknowledgments
5. Minimum payment amount and amount precision
6. Network transaction fees and related display rules
7. Deposit suspension, network maintenance, and abnormal transaction handling mechanisms

If the same virtual asset operates on different blockchain networks, each network channel must be identified and managed separately to prevent asset loss resulting from the payer selecting the wrong network.

Specific details regarding the initially supported virtual asset, blockchain network, and access order must be separately determined in writing by both parties.

### 3.3 Payment Orders, QR Codes, and Payment Links

Company B must develop the following core payment collection functions:

1. Create virtual asset payment orders via the merchant backend, the standardized API, or the cashier Android POS application.
2. Generate a unique order number based on the payment amount, currency, and network.
3. Generate a payment QR code containing the recipient address, payment amount, virtual asset type, blockchain network, and order information.
4. Generate a payment link that can be opened on a webpage, mobile, or third-party application.
5. Clearly display the payment currency, network, amount, recipient address, order validity period, and risk warnings on the payment page.
6. Support fixed-price payments and other payment methods confirmed by both parties.
7. Support order validity periods and timeout processing.
8. Identify or display notifications for abnormal conditions such as insufficient payment amount, overpayment, duplicate payment, delayed arrival, or incorrect network.
9. Support sellers in copying payment links, downloading QR codes, or sending payment information to customers.
10. Automatically update order status based on on-chain transaction results.

### 3.4 On-chain Monitoring and Order Confirmation

Company B must establish an on-chain transaction monitoring mechanism compatible with the connected blockchain network. This includes the following:

1. Identify on-chain payments corresponding to the order.
2. Obtain the transaction hash, block height, payment address, recipient address, payment amount, and transaction time.
3. Set the number of block confirmations based on the network type.
4. Differentiates order statuses such as Pending Payment, Confirmed, Verifying, Completed, Expired, Payment Anomaly, and Failed.
5. Sends notifications to the merchant system via webhooks or APIs when the order status changes.
6. Establishes response mechanisms for node delays, blockchain congestion, on-chain rollbacks, duplicate notifications, and temporary service interruptions.
7. Retains technical logs, transaction records, and operational records necessary for troubleshooting and auditing.

Company B provides on-chain transaction monitoring and technical verification services. Unless otherwise agreed in writing by both parties, Company B bears no responsibility for the operation of the blockchain network itself and assumes no unconditional liability for delays or losses caused by blockchain congestion, forks, protocol vulnerabilities, third-party node errors, or force majeure.

### 3.5 API and System Integration

Company B provides standardized APIs and technical documentation to enable Company A or its partner merchants to integrate payment collection functions into websites, apps, POS systems, or other business systems. Company B also delivers a **cashier-only Android APK** for handheld Android POS terminals (create order, show QR, follow on-chain status, print receipt on supported hardware). The APK uses the same APIs; it is not a payer wallet and does not hold private keys.

In principle, the relevant functions are as follows:

1. Creating a payment order
2. Checking order status
3. Retrieving on-chain transaction information
4. Obtaining payment QR codes and payment links
5. Receiving order status webhook notifications
6. Viewing and exporting transaction records
7. API authentication, signing, prevention of replay attacks, and restriction of access frequency
8. Guidelines for configuring test and production environments

### 3.6 Deployment and Production Environment

Party B shall deploy the test and production environment in accordance with the technical architecture agreed upon by both parties, including but not limited to the following:

1. Deployment of application services and databases
2. Access to blockchain nodes or third-party node services
3. Configuration of domain names, SSL certificates, and network security
4. Data backup, log recording, and system monitoring
5. Management of access rights, keys, and critical configurations
6. Anomaly alerts, failover, and disaster recovery mechanisms
7. Provision of deployment documentation, operations and maintenance documentation, and system architecture diagrams

In principle, this system must be deployed to cloud service accounts, server accounts, and related third-party service accounts designated or managed by Company A. If Company B's account must be used, both parties must agree in writing in advance on data ownership, access rights, cost sharing, and a migration plan after the termination of cooperation.

## IV. Phase 1 Deliverables

Upon completion of Phase 1, Company B must, in principle, provide Company A with the following deliverables:

1. Product requirements specification verified by both parties
2. UI/UX design documentation and key business process diagrams
3. System-wide architecture diagram
4. Database structure and interface design documentation
5. Complete source code that is compileable and deployable
6. Merchant portal, agent portal, platform administration backend, payment order checkout page, and service bill checkout page
7. Cashier Android POS application (signed APK, source, and install notes)
8. APIs, webhooks, and system integration documents
9. List of connected virtual assets and blockchain networks
10. Test environment and production environment
11. Functional test, stress test, and security test reports
12. Deployment, backup, recovery, and daily operation and maintenance documentation
13. System administrator operation manual and merchant user manual (including cashier POS)
14. List of third-party services, open source components, and software licenses
15. Other deliverables separately acknowledged in writing by both parties

The Vendor (Party B) shall not provide only the executable program and must not fail to provide the source code, distribution files, database structure, system configuration, and necessary technical documentation specified in this project.

## V. Security Testing and Deployment Conditions

The Vendor shall complete development and testing in accordance with industry-standard software security practices. Prior to the official release of the system, at least the following tasks must be completed:

1. Functional testing and regression testing
2. API interface and authorization testing
3. Identity authentication and access control testing
4. Database and critical data security checks
5. Private key, API key, and system key management checks
6. General web security vulnerability checks
7. Re-run prevention, duplicate order prevention, and duplicate notification prevention testing
8. Blockchain transaction monitoring and block verification testing
9. Abnormal payment and network outage scenario testing
10. Stress tests, stability tests, and recovery tests
11. Vulnerability checks for third-party dependent components and open source software
12. Independent third-party security audits or penetration tests agreed upon by both parties

The system must not be officially released if there are serious or high-risk security vulnerabilities. Party B shall correct all security vulnerabilities, program defects, and system errors resulting from its development work free of charge within the period agreed upon by both parties, and cooperate in the completion of retesting.

Passing system tests does not exempt Party B from liability for hidden defects, malware, backdoors, unauthorized data access, or development practices that do not conform to the contract.

## VI. Responsibilities

### 6.2 Responsibilities of Party B

Party B shall primarily bear the following responsibilities:

1. Complete development in accordance with the requirements, technical standards, and schedules determined by both parties.
2. Provide qualified personnel necessary for product development, front-end development, back-end development, blockchain development, testing, and operation/maintenance.
3. Ensure that the provided deliverables do not include undisclosed restrictions on third-party rights.
4. Do not subcontract core business operations to a third party without the written consent of Party A.
5. The Embezzler shall not embed backdoors, malicious programs, or unauthorized data collection functions into the system.
6. The Embezzler shall maintain the confidentiality of the Doctor's business information, system data, source code, keys, and customer information.
7. Any discovered or that may affect system security

## VII. Non-Custodial Technology Model

Unless otherwise agreed by both parties through a separate written agreement in a subsequent phase, Phase 1 is designed in principle as a non-custodial technology model.

1. Company B does not hold or manage the virtual assets of Company A (the Seller) or the Payer.
2. Company B does not hold or manage the private keys of the Customer's wallet.
3. Company B does not sign, authorize, or initiate virtual asset transfers on behalf of the Customer.
4. Company B does not provide services for the purchase, sale, exchange, matching, or fiat currency payment of virtual assets.
5. In principle, received assets are transferred directly to a wallet address designated and managed by the Seller.
6. Platform service fees (subscription and volume fee) are billed **separately** from payer on-chain payments; fee settlement uses the **platform billing wallet** or agreed off-chain settlement — not a deduction from the payer on-chain payment.
7. Specific management methods for wallet addresses, private keys, and signing authority must be clearly specified in the technology architecture document.
8. Any functions that allow Company B or Company A to actually manage, collect, or transfer **Customer (payer) assets** must be approved in writing by Company A and undergo a separate legal, regulatory, and security assessment. Watch-only xPub address derivation for **payment order** matching (Mode S) does not give CryptoGate signing authority over merchant funds. If the platform includes mnemonic phrase or private key management, automated sweeping of merchant payment receipts, or signing transactions on behalf of users, both parties shall separately clarify wallet control, asset security responsibilities, key management standards, authorization authority, and regulatory requirements.

## VIII. Acquisition Procedure

Phase 1 is to be acquired in stages according to the milestones agreed upon in the formal agreement and appendices, and generally includes the following steps:

1. Verification of product requirements and prototype
2. Completion of core feature development
3. Establishment of test environment and functional testing
4. Security testing and troubleshooting
5. Establishment of production environment
6. Pilot operation
7. Final acquisition and official launch

Party A shall provide written feedback within the agreed period after receiving the deliverables for each stage. Party A shall rectify all issues arising within the agreed scope of work.

The following situations are generally not considered final approval:

1. If core functions do not operate normally
2. If finalized virtual assets or networks are not fully integrated
3. If serious or high-risk security vulnerabilities exist
4. If the on-chain payment status cannot be accurately identified or updated
5. If source code, deployment files, or core technical documentation are not fully provided
6. If the system cannot be independently deployed or operated normally in a consensus operating environment

## IX. Post-Launch Maintenance Partnership

Upon completion of Phase 1 security testing, passing approval, and official launch, Company B will continuously provide services as a technical maintenance and upgrade partner for this product.

Maintenance tasks generally include the following:

1. Monitoring system operational status
2. Fixing program defects and security vulnerabilities
3. Technical adaptation for blockchain network upgrades, node interface changes, and token contract changes
4. Regular maintenance of databases, servers, and applications
5. System backups, disaster recovery, and log review
6. Maintenance of API and webhook stability
7. Updates to third-party components and installation of security patches
8. Response to emergency technical failures
9. Small-scale feature optimization within the scope agreed upon by both parties
10. Submission of regular maintenance records and system operation reports

The following items must be additionally specified by both parties in the formal contract or maintenance service agreement:

1. Warranty period
2. Maintenance service duration and costs
3. Failure severity and response time
4. Recovery time and service availability targets
5. 24/7 emergency support system
6. Billing method for new networks, currencies, and key functions
7. Cost sharing method for third-party cloud services, node services, and security services
8. System and data handover after termination of maintenance services

Problems caused by defects in Company B's initial development shall be repaired free of charge by Company B within the warranty period. For work related to the development of new features, major architectural changes, the construction of a new blockchain network, or changes to Company A's business model, costs and development periods may be calculated separately by both parties.

## X. Intellectual Property Rights and Data Ownership

1. Unless otherwise agreed in writing by both parties, after Company A has paid the development costs, the intellectual property rights to the source code, product design, database structure, interface files, technical documentation, and other deliverables generated by the custom development of this project shall belong to Company A.
2. Company B retains the intellectual property rights to any general technology, development tools, or basic components that were already owned by Company B prior to the collaboration. However, Company B shall disclose such rights to Company A and grant long-term usage rights necessary for the operation, maintenance, modification, and upgrade of this project.
3. If open source software or third-party components are used, Party A shall verify that the relevant license permits the lawful commercial use of this project and provide Party A with a list of licenses.
4. Account data, order data, transaction records, logs, and operational data generated by Party A, the Merchant, and the Customer in the system shall be the property of Party A or the relevant rights holders.
5. Party A shall not copy, sell, disclose, analyze, or use the relevant data for other projects without Party A’s written consent, nor shall Party A retain the data beyond the scope necessary for maintenance.
6. Party A shall not unilaterally terminate the system, delete data, restrict Party A’s access, or refuse to transfer completed deliverables for which payment has been received, on the grounds of a fee dispute or the termination of cooperation.

## XI. Confidentiality Obligation

Both parties agree to maintain the confidentiality of business plans, product information, technical architecture, source code, customer information, transaction data, quotations, contract terms, and other non-public information acquired during the course of cooperation.

Neither party shall disclose confidential information to a third party or use it for purposes other than this project without the written consent of the information provider.

System keys, wallet information, customer data, and information regarding security vulnerabilities shall be managed in accordance with the highest standards of internal security. This Confidentiality Obligation shall not be nullified by this Letter of Intent, the formal contract, or the termination of cooperation between the two parties.

## XII. Future Cooperation Opportunities

Upon successful completion of Phase 1, Party A may prioritize future cooperation with Party A, including but not limited to the following:

1. Integration with more virtual assets and blockchain networks
2. Development of iOS and Android **payer / consumer** applications (distinct from the Phase 1 cashier POS APK)
3. Development of non-custodial wallets or other wallet products that have undergone compliance evaluation
4. Addition of merchant payment, settlement, and financial reconciliation features
5. Integration with licensed cryptocurrency service providers, payment institutions, or fiat currency deposit and withdrawal partners
6. Development of cryptocurrency trading features
7. Integration of cryptocurrency and fiat currency exchange and settlement services
8. Implementation of enterprise wallets, fund management, and multi-factor authentication features
9. Addition of KYC/KYB, Anti-Money Laundering (AML), sanctions screening, and transaction risk monitoring features
10. Development of membership, point, or token-related applications
11. System internationalization, multilingual distribution, and localization for various jurisdictions
12. Provision of long-term technical team support, system upgrades, and cybersecurity services

The aforementioned subsequent collaborations are not automatically included in the scope or costs of Phase 1 development. Each subsequent phase is evaluated independently in accordance with legal and regulatory requirements, and requirements, costs, schedules, intellectual property rights, and scope of liability are separately confirmed by both parties.

If the delivery quality, system security, maintenance responsiveness, and commercial conditions of Phase 1 meet the requirements of Phase 1, Phase 2 shall have priority in subsequent project negotiations. However, this priority does not imply an obligation for Phase 1 to continue commissioning additional development for Phase 2.

## XIII. Development Costs and Payment Methods

The total development costs, payment currency, taxes, payment account, and payment milestones for Phase 1 shall be clearly specified by both parties in the formal Product Development Agreement.

In principle, payments may be linked to the following milestones:

1. Signing of the formal contract and commencement of the project
2. Finalization of the product prototype and technical architecture
3. Completion of core features and deployment of test environments
4. Passing of functional and security tests
5. Official launch and final approval

Company B shall issue appropriate invoices, receipts, or other valid proof of payment to Company A in accordance with the law. Company A shall not be obligated to pay for any additional work or costs not acknowledged in writing by Company A.

## XIV. Nature of the Letter of Intent

This Letter of Intent records the current intent to cooperate and the proposed scope of work of both parties, and serves as a basis for future negotiations and the drafting of a formal product development agreement, product requirements specification, technical service and maintenance agreement, and other annexes.

Except for confidentiality obligations, protection of intellectual property rights, data security, governing law, and provisions explicitly agreed upon by both parties as binding, this Letter of Intent does not, in principle, impose any legal obligation on either party to enter into a final contract or complete the transaction.

Until a formal contract is concluded, neither party may assume any commitments, incur costs, or bear any obligations on behalf of the other party solely on the basis of this Letter of Intent.

## XV. Governing Law and Dispute Resolution

The governing law and jurisdiction for dispute resolution applicable to this Letter of Intent and the formal contract to be concluded thereafter shall be determined separately by consultation between the two parties, taking into consideration the Party's place of registration, the location of system implementation, and project management requirements, and must be clearly specified in the formal contract.

In the event that a dispute arises during the cooperation process, both parties shall first attempt to resolve it through amicable consultation. If consultation fails, the dispute may be brought before an arbitration body or court with jurisdiction, as specified in the formal contract.
