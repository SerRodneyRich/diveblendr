/**
 * Curated technical-diving resources.
 *
 * Every URL here was fetched and checked before being listed. Entries whose
 * target 404'd were repointed at the live equivalent or removed; two hosts
 * (omsdive.com, quest.naui.org) stopped resolving entirely and are gone.
 *
 * A handful of sites sit behind a bot wall and answer 403/401 to an automated
 * request while working normally in a browser. Those are marked `unverified`
 * so the page can say so rather than quietly implying a clean check.
 */

export interface Resource {
  name: string
  url: string
  /** One line, factual. What the diver gets by following the link. */
  description: string
  /**
   * True when an automated fetch was refused (403/401 from a bot wall) and the
   * link could not be confirmed end-to-end.
   */
  unverified?: boolean
}

export interface ResourceGroup {
  id: string
  title: string
  /** What this group is for, in one line. */
  blurb: string
  resources: Resource[]
}

export const resourceGroups: ResourceGroup[] = [
  {
    id: 'training',
    title: 'Training agencies',
    blurb:
      'Certifying bodies for decompression, mixed gas, rebreather and overhead diving.',
    resources: [
      {
        name: 'GUE — Global Underwater Explorers',
        url: 'https://www.gue.com',
        description:
          'DIR training built around standardised equipment and team procedure. Strict prerequisites, exploration focus.',
      },
      {
        name: 'IANTD',
        url: 'https://iantd.com',
        description:
          'One of the original mixed-gas and rebreather agencies. Full technical, cave and wreck progressions.',
      },
      {
        name: 'TDI — Technical Diving International',
        url: 'https://www.tdisdi.com',
        description:
          'The largest technical agency by certification volume. Modular courses in trimix, rebreather and cave.',
        unverified: true,
      },
      {
        name: 'PADI TecRec',
        url: 'https://www.padi.com/education/technical-diving',
        description:
          'Structured technical and rebreather progression with staged depth limits.',
      },
      {
        name: 'SSI Extended Range',
        url: 'https://www.divessi.com/en/advanced-training/extended-range',
        description:
          'Technical programmes covering decompression procedures, trimix and equipment configuration.',
      },
      {
        name: 'NAUI Technical',
        url: 'https://www.naui.org/learn/technical-diver',
        description:
          'Decompression, trimix and rebreather courses with wide instructor latitude on standards.',
      },
      {
        name: 'BSAC technical courses',
        url: 'https://www.bsac.com/training/technical-diving-courses',
        description:
          'UK club-based training with a strong emphasis on self-reliance and dive planning.',
      },
      {
        name: 'UTD — Unified Team Diving',
        url: 'https://utdscubadiving.com',
        description: 'DIR-derived team diving with unified equipment configuration.',
      },
      {
        name: 'ISE — Inner Space Explorers',
        url: 'https://is-expl.com',
        description: 'Cave and exploration-focused technical training.',
      },
      {
        name: 'RESA — Rebreather Education and Safety Association',
        url: 'https://www.rebreather.org',
        description:
          'Cross-agency body setting minimum rebreather training and unit-testing standards.',
      },
    ],
  },
  {
    id: 'research',
    title: 'Decompression and diving medicine',
    blurb:
      'Peer-reviewed literature and the physiology behind the numbers this app produces.',
    resources: [
      {
        name: 'Diving and Hyperbaric Medicine (DHM)',
        url: 'https://www.dhmjournal.com/index.php/full-journals-embargoed/full-journals',
        description:
          'The SPUMS/EUBS journal. Full issues free after embargo — the primary source for current decompression and oxygen-toxicity research.',
      },
      {
        name: 'UHMS — Undersea and Hyperbaric Medicine journal',
        url: 'https://www.uhms.org/publications/uhm-journal/download-uhm-journal-pdfs.html',
        description:
          'Archive of UHM journal PDFs covering diving physiology, DCS treatment and hyperbaric medicine.',
      },
      {
        name: 'The Theoretical Diver',
        url: 'https://thetheoreticaldiver.org/',
        description:
          'Decompression modelling worked through in the open — Bühlmann, VPM and gradient factors with the mathematics shown.',
      },
      {
        name: 'Shearwater community blog',
        url: 'https://shearwater.com/blogs/community',
        description:
          'Long-form articles on decompression algorithms, gradient factors and dive computer behaviour.',
      },
      {
        name: 'InDEPTH',
        url: 'https://indepthmag.com',
        description:
          'GUE-published magazine covering technical diving practice, incident analysis and physiology.',
      },
      {
        name: 'Fit to Dive',
        url: 'https://www.fittodive.org',
        description: 'Diver fitness and medical-screening guidance.',
        unverified: true,
      },
    ],
  },
  {
    id: 'gas',
    title: 'Gas blending and analysis',
    blurb:
      'Suppliers of blending equipment, analysers and the fittings that go with them.',
    resources: [
      {
        name: 'Divesoft',
        url: 'https://www.divesoft.com',
        description:
          'Oxygen and helium analysers, rebreathers and dive computers. The analysers are a technical-diving default.',
      },
      {
        name: 'Narked at 90',
        url: 'https://www.narkedat90.com',
        description:
          'UK builder of gas analysers, blending panels and rebreather electronics.',
        unverified: true,
      },
      {
        name: 'Dive Gear Express',
        url: 'https://www.divegearexpress.com',
        description:
          'US technical retailer with unusually detailed reference articles on blending, oxygen service and cylinder care.',
        unverified: true,
      },
      {
        name: 'Light Monkey',
        url: 'https://www.lightmonkey.us',
        description: 'Blending equipment, oxygen-clean fittings, lights and manifolds.',
      },
      {
        name: 'Northeast Scuba Supply',
        url: 'https://northeastscubasupply.com',
        description: 'Technical gear and gas-handling components.',
      },
      {
        name: 'Tec-Divesysteme',
        url: 'https://www.tec-divesysteme.com/en',
        description: 'European technical supplier including blending hardware.',
      },
    ],
  },
  {
    id: 'tools',
    title: 'Instruments and dive computers',
    blurb: 'The hardware that runs the decompression model underwater.',
    resources: [
      {
        name: 'Shearwater Research',
        url: 'https://www.shearwater.com',
        description:
          'Perdix, Petrel and Teric computers. Bühlmann ZHL-16C with gradient factors, plus VPM-B on some models.',
      },
      {
        name: 'Heinrichs Weikamp',
        url: 'https://hwdiving.com/',
        description: 'OSTC computers, open firmware, and CCR monitoring hardware.',
      },
      {
        name: 'Ratio Computers',
        url: 'http://www.ratio-computers.com',
        description: 'Italian dive computers with multi-gas and CCR support.',
      },
      {
        name: 'Halcyon Dive Systems',
        url: 'https://www.halcyon.net',
        description: 'DIR harnesses, wings, lights and the Halcyon CCR.',
      },
      {
        name: 'XDeep',
        url: 'https://xdeep.eu',
        description: 'Sidemount and backmount harness systems, wings and hard cases.',
      },
    ],
  },
  {
    id: 'rebreathers',
    title: 'Rebreathers',
    blurb: 'Manufacturers of closed and semi-closed circuit units.',
    resources: [
      {
        name: 'AP Diving',
        url: 'https://www.apdiving.com',
        description: 'Inspiration and Evolution CCRs, plus their own training resources.',
      },
      {
        name: 'JJ-CCR',
        url: 'https://jj-ccr.com',
        description: 'Danish back-mounted CCR, widely used for exploration and cave.',
      },
      {
        name: 'rEvo Rebreathers',
        url: 'https://www.revo-rebreathers.com',
        description: 'Belgian CCR with dual radial scrubbers and temperature-stick monitoring.',
      },
      {
        name: 'KISS Rebreathers',
        url: 'https://www.kissrebreathers.com',
        description: 'Mechanically simple manual and electronic CCRs.',
      },
      {
        name: 'Fathom CCR',
        url: 'https://www.fathomdive.com/fathom-ccr',
        description: 'Minimalist mCCR designed around cave exploration.',
      },
      {
        name: 'Poseidon rebreathers',
        url: 'https://www.poseidon.com/en-se/rebreathers/',
        description: 'SE7EN and MkVI units with automated pre-dive checks.',
      },
      {
        name: 'Innerspace Systems (Megalodon)',
        url: 'https://megccr.com',
        description: 'The Megalodon CCR and its variants.',
      },
      {
        name: 'Lungfish Dive Systems',
        url: 'https://www.lungfishdivesystems.com',
        description: 'Norwegian CCR manufacturer.',
      },
      {
        name: 'The Rebreather Site',
        url: 'http://www.therebreathersite.nl',
        description:
          'Long-running independent archive documenting rebreather models, history and modifications.',
      },
    ],
  },
  {
    id: 'community',
    title: 'Community and publications',
    blurb: 'Where technical divers argue, publish and share trip reports.',
    resources: [
      {
        name: 'ScubaBoard — technical diving',
        url: 'https://scubaboard.com/community/forums/technical-diving.43/',
        description:
          'The largest scuba forum. Technical subforum has active instructors and equipment manufacturers.',
      },
      {
        name: 'DeeperBlue — technical diving',
        url: 'https://forums.deeperblue.com/forums/technical-diving.43/',
        description: 'Smaller technical forum with a strong freediving and European presence.',
      },
      {
        name: 'X-Ray Magazine',
        url: 'https://xray-mag.com',
        description: 'Free international dive magazine covering technical and expedition diving.',
      },
      {
        name: 'Advanced Diver Magazine',
        url: 'https://advanceddiver.com',
        description: 'Exploration, cave and wreck reporting.',
      },
      {
        name: 'The Technical Diver',
        url: 'https://thetechnicaldiver.com',
        description: 'Independent technical diving writing and equipment reviews.',
      },
      {
        name: 'GUE on YouTube',
        url: 'https://www.youtube.com/@GUEdivers',
        description: 'Conference talks, skills demonstrations and project documentaries.',
      },
      {
        name: 'Richard Harris talks',
        url: 'https://www.youtube.com/playlist?list=PLeSAix3wSmiVOlY87QSM_n_BLRPOVe66q',
        description:
          'Lecture playlist from the cave diver and anaesthetist, largely on diving physiology and risk.',
      },
    ],
  },
]

/** Total number of listed resources, for the page subtitle. */
export const resourceCount = resourceGroups.reduce(
  (n, g) => n + g.resources.length,
  0
)
