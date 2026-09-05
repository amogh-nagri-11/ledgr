// Acceptance evidence, as raw documents.
//
// THIS IS THE FILE THAT MATTERS. In the previous corpus each event carried a
// `type` field like `objection_raised`, which handed the model its answer and
// let a regex reproduce the agent's output exactly. Nothing here is typed by
// meaning. `medium` says how the document arrived -- an email, a scan, a
// system note -- which is all a real system would know. What the document
// *is* has to be read out of the body.
//
// The hard cases, and what each defeats:
//   an objection that never uses the word            -> keyword matching
//   the word "objection" about the RATE, not goods   -> keyword matching, the
//                                                       expensive way round
//   an objection raised outside the contractual window
//   no GRN and no objection at all -> deemed acceptance
//   partial acceptance

import { addDays, today } from '../engine/dates.js';

const T = today();
const ago = (n) => addDays(T, -n);

const doc = (d) => d;

export const acceptanceDocuments = [
  // ------------------------------------------------------- INV-4101 control
  doc({
    ref: 'DN-90121', invoiceId: 'INV-4101', medium: 'scanned_document', date: ago(52),
    body: 'DELIVERY CHALLAN 90121. Consignee: Buyer works, Pune. 14 MT MS plate as per PO 4390. Vehicle MH12 AB 4471.',
  }),
  doc({
    ref: 'GRN-7741', invoiceId: 'INV-4101', medium: 'scanned_document', date: ago(52),
    body: 'GOODS RECEIPT NOTE 7741. Received against DC 90121. Quantity and grade verified against mill certificate. Received in full and in good condition. Signed, Stores In-charge.',
  }),

  // ------------------------------------------------------- INV-4102 control
  doc({
    ref: 'DN-90203', invoiceId: 'INV-4102', medium: 'scanned_document', date: ago(48),
    body: 'DELIVERY CHALLAN 90203. Machined components, 400 nos, batch 22.',
  }),
  doc({
    ref: 'GRN-7788', invoiceId: 'INV-4102', medium: 'scanned_document', date: ago(48),
    body: 'GOODS RECEIPT NOTE 7788. Dimensional check completed on sample of 20. All within tolerance. Accepted in full.',
  }),

  // ------------------------------------------------------- INV-4103 control
  doc({
    ref: 'DN-90410', invoiceId: 'INV-4103', medium: 'scanned_document', date: ago(14),
    body: 'DELIVERY CHALLAN 90410. Corrugated cartons, 3000 nos.',
  }),
  doc({
    ref: 'GRN-7830', invoiceId: 'INV-4103', medium: 'scanned_document', date: ago(14),
    body: 'GOODS RECEIPT NOTE 7830. Count verified. Accepted.',
  }),

  // ---------- INV-4104: objection to the GOODS, inside the 7-day window (4.2)
  doc({
    ref: 'DN-90190', invoiceId: 'INV-4104', medium: 'scanned_document', date: ago(44),
    body: 'DELIVERY CHALLAN 90190. 12 crates, Ahmedabad to Pune lane. Sealed at origin.',
  }),
  doc({
    ref: 'EMAIL-3312', invoiceId: 'INV-4104', medium: 'email', date: ago(41),
    from: 'stores@buyer.example', to: 'finance@meghdoot.example',
    subject: 'Re: consignment against DC 90190 - crates 4, 7, 9, 11',
    body: 'Four of the twelve crates have come in water damaged, the cartons inside are pulped. We are not taking these into stores and we are not treating the consignment as received until you send replacements. Please treat this mail as our formal notice under clause 4.2. The remaining crates are being held uninspected pending your reply.',
  }),
  doc({
    ref: 'DN-90266', invoiceId: 'INV-4104', medium: 'scanned_document', date: ago(33),
    body: 'DELIVERY CHALLAN 90266. Replacement of 4 crates against earlier DC 90190.',
  }),
  doc({
    ref: 'GRN-7802', invoiceId: 'INV-4104', medium: 'scanned_document', date: ago(30),
    body: 'GOODS RECEIPT NOTE 7802. Replacement crates checked against the original packing list. Full consignment now received and accepted. Earlier notice stands withdrawn.',
  }),

  // ------------------------------------------------------- INV-4105 control
  doc({
    ref: 'DN-90250', invoiceId: 'INV-4105', medium: 'scanned_document', date: ago(35),
    body: 'DELIVERY CHALLAN 90250. CNC controller units, 2 nos.',
  }),
  doc({
    ref: 'GRN-7795', invoiceId: 'INV-4105', medium: 'scanned_document', date: ago(33),
    body: 'GOODS RECEIPT NOTE 7795. Accepted after power-on inspection.',
  }),

  // ------------------------------------------------------- INV-4106 control
  doc({
    ref: 'DN-90300', invoiceId: 'INV-4106', medium: 'scanned_document', date: ago(26),
    body: 'DELIVERY CHALLAN 90300. Printed product catalogues, 5000 nos, 32pp saddle stitched.',
  }),
  doc({
    ref: 'GRN-7811', invoiceId: 'INV-4106', medium: 'scanned_document', date: ago(26),
    body: 'GOODS RECEIPT NOTE 7811. Print quality checked against approved proof. Accepted in full.',
  }),

  // ------------------------------------------------------- INV-4107 control
  doc({
    ref: 'DN-90355', invoiceId: 'INV-4107', medium: 'scanned_document', date: ago(21),
    body: 'DELIVERY CHALLAN 90355. TMT bars, 8 MT, Fe 500D.',
  }),
  doc({
    ref: 'GRN-7819', invoiceId: 'INV-4107', medium: 'scanned_document', date: ago(21),
    body: 'GOODS RECEIPT NOTE 7819. Weighbridge slip attached. Accepted.',
  }),

  // ------------------------------------------------------- INV-4108 control
  doc({
    ref: 'DN-90371', invoiceId: 'INV-4108', medium: 'scanned_document', date: ago(19),
    body: 'DELIVERY CHALLAN 90371. Fabricated mounting brackets, 240 sets, made to drawing BK-118 rev C.',
  }),
  doc({
    ref: 'GRN-7824', invoiceId: 'INV-4108', medium: 'scanned_document', date: ago(19),
    body: 'GOODS RECEIPT NOTE 7824. Dimensional inspection passed against drawing BK-118 rev C. Accepted in full.',
  }),

  // -------------------------------------------- INV-4109 / 4110 plain trails
  doc({
    ref: 'DN-90388', invoiceId: 'INV-4109', medium: 'scanned_document', date: ago(24),
    body: 'DELIVERY CHALLAN 90388. Cotton wiping cloth, 400 kg.',
  }),
  doc({
    ref: 'GRN-7827', invoiceId: 'INV-4109', medium: 'scanned_document', date: ago(24),
    body: 'GOODS RECEIPT NOTE 7827. Weighed and accepted.',
  }),
  doc({
    ref: 'DN-90394', invoiceId: 'INV-4110', medium: 'scanned_document', date: ago(23),
    body: 'DELIVERY CHALLAN 90394. Pressed steel components, 1500 nos.',
  }),
  doc({
    ref: 'GRN-7828', invoiceId: 'INV-4110', medium: 'scanned_document', date: ago(23),
    body: 'GOODS RECEIPT NOTE 7828. Sample check passed. Accepted.',
  }),

  // ------------------------------------------------------- INV-4111 control
  doc({
    ref: 'DN-90402', invoiceId: 'INV-4111', medium: 'scanned_document', date: ago(17),
    body: 'DELIVERY CHALLAN 90402. Laminated boards, 180 sheets.',
  }),
  doc({
    ref: 'GRN-7831', invoiceId: 'INV-4111', medium: 'scanned_document', date: ago(17),
    body: 'GOODS RECEIPT NOTE 7831. Accepted.',
  }),

  // -- INV-4112: the word "objection", but about the RATE. Goods were accepted.
  //    Clause 4.2 of the Falcon agreement says a rate dispute does not entitle
  //    the buyer to withhold acceptance. The clock does NOT restart.
  doc({
    ref: 'DN-90415', invoiceId: 'INV-4112', medium: 'scanned_document', date: ago(28),
    body: 'DELIVERY CHALLAN 90415. Freight, Jaipur to Pune, 3 trips.',
  }),
  doc({
    ref: 'GRN-7833', invoiceId: 'INV-4112', medium: 'scanned_document', date: ago(28),
    body: 'GOODS RECEIPT NOTE 7833. All three consignments received complete and undamaged. Accepted.',
  }),
  doc({
    ref: 'EMAIL-3390', invoiceId: 'INV-4112', medium: 'email', date: ago(25),
    from: 'procurement@buyer.example', to: 'ops@falconfreight.example',
    subject: 'Objection - rate applied on trip 3',
    body: 'We are raising a formal objection to the rate billed on the third trip. Our agreed tariff is 41 per km and you have billed 47. The goods themselves came in fine and are already in stores, this is purely a rate matter. Please issue a credit note for the difference in next month cycle as per clause 4.2.',
  }),

  // ------------------------------------------------------- INV-4113 control
  doc({
    ref: 'DN-90420', invoiceId: 'INV-4113', medium: 'scanned_document', date: ago(16),
    body: 'DELIVERY CHALLAN 90420. Assorted office stationery.',
  }),
  doc({
    ref: 'GRN-7836', invoiceId: 'INV-4113', medium: 'scanned_document', date: ago(16),
    body: 'GOODS RECEIPT NOTE 7836. Accepted.',
  }),

  // ------------------------------------------------------- INV-4114 control
  doc({
    ref: 'DN-90431', invoiceId: 'INV-4114', medium: 'scanned_document', date: ago(13),
    body: 'DELIVERY CHALLAN 90431. Carbide insert tooling, 60 sets, against PO 4417.',
  }),
  doc({
    ref: 'GRN-7840', invoiceId: 'INV-4114', medium: 'scanned_document', date: ago(13),
    body: 'GOODS RECEIPT NOTE 7840. Counted and accepted at stores.',
  }),

  // -------------------------------------------- INV-4115 / 4116 plain trails
  doc({
    ref: 'DN-90440', invoiceId: 'INV-4115', medium: 'scanned_document', date: ago(30),
    body: 'DELIVERY CHALLAN 90440. LT distribution panel, 1 no.',
  }),
  doc({
    ref: 'GRN-7842', invoiceId: 'INV-4115', medium: 'scanned_document', date: ago(29),
    body: 'GOODS RECEIPT NOTE 7842. Panel inspected and accepted. Commissioning to follow separately.',
  }),
  doc({
    ref: 'DN-90447', invoiceId: 'INV-4116', medium: 'scanned_document', date: ago(20),
    body: 'DELIVERY CHALLAN 90447. Isopropyl alcohol, 12 drums.',
  }),
  doc({
    ref: 'GRN-7845', invoiceId: 'INV-4116', medium: 'scanned_document', date: ago(20),
    body: 'GOODS RECEIPT NOTE 7845. Seals intact, quantity verified. Accepted.',
  }),

  // -------------------------------------------- INV-4117 / 4118 plain trails
  doc({
    ref: 'DN-90455', invoiceId: 'INV-4117', medium: 'scanned_document', date: ago(22),
    body: 'DELIVERY CHALLAN 90455. Annual report booklets, 1200 nos.',
  }),
  doc({
    ref: 'GRN-7848', invoiceId: 'INV-4117', medium: 'scanned_document', date: ago(22),
    body: 'GOODS RECEIPT NOTE 7848. Checked against approved proof. Accepted.',
  }),
  doc({
    ref: 'JOB-2205', invoiceId: 'INV-4118', medium: 'scanned_document', date: ago(27),
    body: 'SERVICE COMPLETION CERTIFICATE 2205. Hull inspection call completed at Mormugao. Service accepted by the Buyer representative on site.',
  }),

  // ---- INV-4119: nothing but a delivery note. Vendor is unknown to the registry.
  doc({
    ref: 'DN-90462', invoiceId: 'INV-4119', medium: 'scanned_document', date: ago(18),
    body: 'DELIVERY CHALLAN 90462. Seasoned hardwood planks, 60 cft.',
  }),
  doc({
    ref: 'GRN-7851', invoiceId: 'INV-4119', medium: 'scanned_document', date: ago(18),
    body: 'GOODS RECEIPT NOTE 7851. Measured and accepted.',
  }),

  // -- INV-4120: objection raised on day 9, but clause 6.2 gives six (6) days.
  //    Out of time, so the payment period is unaffected.
  doc({
    ref: 'DN-90470', invoiceId: 'INV-4120', medium: 'scanned_document', date: ago(38),
    body: 'DELIVERY CHALLAN 90470. Moulded rubber gaskets, 2000 nos.',
  }),
  doc({
    ref: 'GRN-7854', invoiceId: 'INV-4120', medium: 'scanned_document', date: ago(38),
    body: 'GOODS RECEIPT NOTE 7854. Received and taken into stores.',
  }),
  doc({
    ref: 'EMAIL-3402', invoiceId: 'INV-4120', medium: 'email', date: ago(29),
    from: 'quality@buyer.example', to: 'accounts@himalayarubber.example',
    subject: 'Gasket batch - hardness variation',
    body: 'On using the gaskets from the last lot we are seeing hardness variation outside the band on roughly one in twenty. We object to the batch and would like a replacement lot. We appreciate this is past the inspection period in clause 6.2 but would ask you to look at it commercially.',
  }),

  // -- INV-4121: goods arrived, nobody raised a GRN, nobody objected either.
  //    Acceptance is deemed, not evidenced.
  doc({
    ref: 'DN-90478', invoiceId: 'INV-4121', medium: 'scanned_document', date: ago(41),
    body: 'DELIVERY CHALLAN 90478. Grey iron castings, 60 nos. Left at gate, gate register entry 1189.',
  }),
  doc({
    ref: 'NOTE-9903', invoiceId: 'INV-4121', medium: 'system_note', date: ago(34),
    body: 'Stores confirms the castings are physically in the yard against gate entry 1189. No GRN was raised at the time and none has been raised since. No communication of any kind was sent to the supplier about this consignment.',
  }),

  // -------------------------------------------- INV-4122 / 4123 plain trails
  doc({
    ref: 'DN-90484', invoiceId: 'INV-4122', medium: 'scanned_document', date: ago(15),
    body: 'DELIVERY CHALLAN 90484. Fabricated clamps, 900 nos.',
  }),
  doc({
    ref: 'GRN-7858', invoiceId: 'INV-4122', medium: 'scanned_document', date: ago(15),
    body: 'GOODS RECEIPT NOTE 7858. Accepted.',
  }),
  doc({
    ref: 'DN-90491', invoiceId: 'INV-4123', medium: 'scanned_document', date: ago(12),
    body: 'DELIVERY CHALLAN 90491. BOPP film, 40 reels. Supplied as received from the overseas mill, original mill packing and mill certificates enclosed unopened.',
  }),
  doc({
    ref: 'GRN-7861', invoiceId: 'INV-4123', medium: 'scanned_document', date: ago(12),
    body: 'GOODS RECEIPT NOTE 7861. Reel count verified against the mill packing list. Accepted.',
  }),

  // -- INV-4124: the refusal that never says "objection" or "reject".
  //    Sharma's clause 7.2 makes a signed GRN the evidence of acceptance, and
  //    stores explicitly refuses to raise one until the certificates arrive.
  //    Acceptance happens later, when the GRN is finally signed.
  doc({
    ref: 'DN-90496', invoiceId: 'INV-4124', medium: 'scanned_document', date: ago(37),
    body: 'DELIVERY CHALLAN 90496. MS angle sections, 6 MT.',
  }),
  doc({
    ref: 'EMAIL-3421', invoiceId: 'INV-4124', medium: 'email', date: ago(36),
    from: 'stores@buyer.example', to: 'accounts@sharmaent.example',
    subject: 'DC 90496 - mill test certificates',
    body: 'The angles came in yesterday but there were no mill test certificates with them. We have put the whole lot to one side in the yard and we are not booking them into stores or raising a receipt note until the certificates reach us. Please send them across.',
  }),
  doc({
    ref: 'EMAIL-3428', invoiceId: 'INV-4124', medium: 'email', date: ago(23),
    from: 'accounts@sharmaent.example', to: 'stores@buyer.example',
    subject: 'Re: DC 90496 - mill test certificates',
    body: 'Apologies for the delay. Certificates for heat numbers 41182 and 41190 attached, covering the full 6 MT.',
  }),
  doc({
    ref: 'GRN-7864', invoiceId: 'INV-4124', medium: 'scanned_document', date: ago(22),
    body: 'GOODS RECEIPT NOTE 7864. Mill certificates received and verified against heat numbers. Material booked into stores and accepted in full.',
  }),

  // ------------------------------------------------------- INV-4125 control
  doc({
    ref: 'DN-90502', invoiceId: 'INV-4125', medium: 'scanned_document', date: ago(11),
    body: 'DELIVERY CHALLAN 90502. Assorted fasteners and fixings.',
  }),
  doc({
    ref: 'GRN-7868', invoiceId: 'INV-4125', medium: 'scanned_document', date: ago(11),
    body: 'GOODS RECEIPT NOTE 7868. Accepted.',
  }),
];

export const forInvoice = (invoiceId) =>
  acceptanceDocuments
    .filter((d) => d.invoiceId === invoiceId)
    .sort((a, b) => a.date.localeCompare(b.date));
