'use client'

import { useState, useMemo } from 'react'
import Chip from './Chip'

interface Resource {
  name: string
  url: string
  description: string
  tags: string[]
  category: string
}

export default function LinksPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const allResources = useMemo((): Resource[] => [
    // Training Organizations
    {
      name: "TDI (Technical Diving International)",
      url: "https://www.tdisdi.com",
      description: "Largest technical certification agency worldwide. Offers flexible course progressions including trimix, rebreather, and cave diving.",
      tags: ["Training", "Technical Diving", "Trimix", "Rebreather", "Cave Diving"],
      category: "Training Organizations"
    },
    {
      name: "SSI Extended Range (XR)", 
      url: "https://www.divessi.com/en/advanced-training/extended-range",
      description: "Comprehensive technical diving programs including trimix, decompression diving, and equipment configurations.",
      tags: ["Training", "Technical Diving", "Trimix", "Decompression"],
      category: "Training Organizations"
    },
    {
      name: "PADI TecRec",
      url: "https://www.padi.com/education/technical-diving", 
      description: "Structured technical and rebreather training with strong theoretical foundations and progressive depth limits.",
      tags: ["Training", "Technical Diving", "Rebreather", "Trimix"],
      category: "Training Organizations"
    },
    {
      name: "IANTD (International Association of Nitrox and Technical Divers)",
      url: "https://iantd.com",
      description: "Pioneer in mixed gas diving and rebreathers. Offers comprehensive technical, cave, and wreck diving programs.",
      tags: ["Training", "Technical Diving", "Rebreather", "Trimix", "Cave Diving"],
      category: "Training Organizations"
    },
    {
      name: "GUE (Global Underwater Explorers)",
      url: "https://www.gue.com",
      description: "DIR-focused training with emphasis on team diving, standardized equipment, and exploration. High standards and structured approach.",
      tags: ["Training", "Technical Diving", "DIR", "Team Diving"],
      category: "Training Organizations"
    },
    {
      name: "NAUI Technical",
      url: "https://www.naui.org/learn/technical-diver",
      description: "Comprehensive technical training covering decompression diving, trimix, and rebreather programs with flexible instructor guidelines.",
      tags: ["Training", "Technical Diving", "Trimix", "Rebreather"],
      category: "Training Organizations"
    },
    {
      name: "RESA (Rebreather Education & Safety Association)",
      url: "https://www.rebreather.org",
      description: "Non-profit organization dedicated to improving rebreather safety and education standards across the industry.",
      tags: ["Rebreather", "Safety", "Education"],
      category: "Training Organizations"
    },
    
    // Forums & Resources
    {
      name: "ScubaBoard Technical Diving Forum",
      url: "https://scubaboard.com/community/forums/technical-diving.43/",
      description: "World's largest scuba community with dedicated technical diving discussions and expert contributors.",
      tags: ["Forum", "Technical Diving", "Community"],
      category: "Forums & Resources"
    },
    {
      name: "DeeperBlue Technical Diving Forum", 
      url: "https://forums.deeperblue.com/forums/technical-diving.43/",
      description: "Active community for technical diving, freediving, and spearfishing with global participation.",
      tags: ["Forum", "Technical Diving", "Freediving"],
      category: "Forums & Resources"
    },
    {
      name: "InDEPTH Magazine",
      url: "https://indepthmag.com",
      description: "Monthly technical and professional diving magazine with cutting-edge articles and industry insights.",
      tags: ["Publication", "Technical Diving", "Professional"],
      category: "Forums & Resources"
    },
    {
      name: "Shearwater Research Blog",
      url: "https://www.shearwater.com/blogs/dive-computer-blog",
      description: "Technical diving computer manufacturer with excellent blog covering decompression algorithms and technical subjects.",
      tags: ["Equipment", "Technical Diving", "Decompression", "Algorithms"],
      category: "Forums & Resources"
    },
    {
      name: "TDI/SDI Blog",
      url: "https://www.tdisdi.com/blog",
      description: "Technical diving articles from industry experts covering safety, techniques, and equipment.",
      tags: ["Technical Diving", "Safety", "Training"],
      category: "Forums & Resources"
    },
    {
      name: "AP Diving Training",
      url: "https://www.apdiving.com/en/training",
      description: "Rebreather manufacturer offering training resources and courses for multiple certification agencies.",
      tags: ["Rebreather", "Training", "Equipment"],
      category: "Forums & Resources"
    },
    
    // Additional Training Organizations
    {
      name: "DiveRaid",
      url: "https://diveraid.com/technical-diving",
      description: "International training agency offering technical diving programs with flexible approach and comprehensive course offerings.",
      tags: ["Training", "Technical Diving", "Trimix", "Cave Diving"],
      category: "Training Organizations"
    },
    {
      name: "British Sub Aqua Club (BSAC)",
      url: "https://www.bsac.com/training/technical-diving-courses",
      description: "UK-based training organization with comprehensive technical diving courses and strong emphasis on self-reliance and planning.",
      tags: ["Training", "Technical Diving", "UK"],
      category: "Training Organizations"
    },
    {
      name: "Unified Team Diving (UTD)",
      url: "https://utdscubadiving.com",
      description: "Training organization focused on DIR principles, team diving, and unified equipment configurations with strong technical programs.",
      tags: ["Training", "Technical Diving", "DIR", "Team Diving"],
      category: "Training Organizations"
    },
    {
      name: "Inner Space Explorers (ISE)",
      url: "https://is-expl.com",
      description: "Cave diving and technical training organization specializing in exploration, cave diving, and advanced technical techniques.",
      tags: ["Training", "Cave Diving", "Technical Diving", "Exploration"],
      category: "Training Organizations"
    },

    // Equipment Manufacturers
    {
      name: "Shearwater Research",
      url: "https://www.shearwater.com",
      description: "Leading technical dive computer manufacturer - Perdix, Petrel, Teric, and NERD series.",
      tags: ["Equipment", "Dive Computers", "Technical Diving", "Diveblendr Recommended"],
      category: "Equipment Manufacturers"
    },
    {
      name: "AP Diving", 
      url: "https://www.apdiving.com",
      description: "Rebreather manufacturer - Inspiration, Evolution, and VR Technology rebreathers.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Hollis Gear",
      url: "https://www.hollis.com",
      description: "Technical diving equipment including rebreathers, BCDs, regulators, and dry suits.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "OMS (Ocean Management Systems)",
      url: "https://omsdive.com",
      description: "Technical diving equipment manufacturer - wings, backplates, regulators, and accessories.",
      tags: ["Equipment", "Technical Diving", "DIR"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Halcyon Dive Systems",
      url: "https://www.halcyon.net",
      description: "Premium technical diving equipment with focus on DIR-compliant gear and lighting systems.",
      tags: ["Equipment", "Technical Diving", "DIR"],
      category: "Equipment Manufacturers"
    },
    {
      name: "JJ-CCR",
      url: "https://jj-ccr.com",
      description: "Danish rebreather manufacturer known as 'the 4x4 of the rebreather world' - robust, versatile, and built for demanding technical diving.",
      tags: ["Equipment", "Rebreather", "Technical Diving", "Diveblendr Recommended"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Poseidon",
      url: "https://www.poseidon.com/en-se/rebreathers/",
      description: "Swedish manufacturer of the SE7EN+ fully automatic rebreather, focusing on recreational and technical diving automation.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "rEvo Rebreathers",
      url: "https://www.revo-rebreathers.com",
      description: "Belgian manufacturer of lightweight back-mount rebreathers with long-lasting scrubbers and redundant displays.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Divesoft",
      url: "https://www.divesoft.com",
      description: "Czech manufacturer of the Liberty rebreather, known for user-friendliness and reliability with rapid growing popularity.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "KISS Rebreathers", 
      url: "https://www.kissrebreathers.com",
      description: "American manufacturer of simple, reliable rebreathers following the KISS principle (Keep It Simple, Stupid).",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "XDeep",
      url: "https://xdeep.eu",
      description: "Polish manufacturer of technical diving equipment including sidemount systems, wing BCDs, and diving accessories.",
      tags: ["Equipment", "Technical Diving", "Sidemount", "Diveblendr Recommended"],
      category: "Equipment Manufacturers"
    },
    
    // Dry Suit Manufacturers
    {
      name: "Santi Diving",
      url: "https://santidiving.com",
      description: "Premium dry suit manufacturer known for high-quality technical diving suits, undergarments, and thermal protection.",
      tags: ["Equipment", "Dry Suits", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Fourth Element",
      url: "https://fourthelement.com",
      description: "Technical diving equipment manufacturer specializing in dry suits, undergarments, and thermal protection systems.",
      tags: ["Equipment", "Dry Suits", "Technical Diving", "Thermal Protection"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Ursuit",
      url: "https://www.ursuit.com",
      description: "Finnish dry suit manufacturer with decades of experience in professional and technical diving dry suits.",
      tags: ["Equipment", "Dry Suits", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "DUI (Diving Unlimited International)",
      url: "https://www.divedui.com/collections/premium-drysuits",
      description: "Premium dry suit manufacturer known for high-end technical and professional diving suits.",
      tags: ["Equipment", "Dry Suits", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Otter Watersports",
      url: "https://www.otterwatersports.uk",
      description: "UK dry suit manufacturer offering technical diving dry suits and accessories.",
      tags: ["Equipment", "Dry Suits", "Technical Diving", "UK"],
      category: "Equipment Manufacturers"
    },
    {
      name: "O'Three",
      url: "https://www.othree.co.uk",
      description: "UK-based dry suit manufacturer specializing in technical and recreational diving suits.",
      tags: ["Equipment", "Dry Suits", "Technical Diving", "UK"],
      category: "Equipment Manufacturers"
    },

    // Dive Computer Manufacturers
    {
      name: "Heinrichs Weikamp",
      url: "https://heinrichsweikamp.com/?___store=en&___from_store=en",
      description: "German manufacturer of advanced technical dive computers with focus on technical diving features and customization.",
      tags: ["Equipment", "Dive Computers", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Ratio Computers",
      url: "http://www.ratio-computers.com",
      description: "Italian manufacturer of technical dive computers with advanced features for technical and cave diving.",
      tags: ["Equipment", "Dive Computers", "Technical Diving", "Cave Diving"],
      category: "Equipment Manufacturers"
    },

    // Lighting Manufacturers
    {
      name: "Light Monkey",
      url: "https://www.lightmonkey.us",
      description: "Premium underwater lighting manufacturer specializing in cave diving and technical diving lights.",
      tags: ["Equipment", "Lighting", "Technical Diving", "Cave Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "GRALmarine",
      url: "https://www.gralmarine.com/mainlights-en",
      description: "European manufacturer of high-quality underwater lighting systems for technical diving.",
      tags: ["Equipment", "Lighting", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Underwater Light Dude",
      url: "https://uwlightdude.com",
      description: "Specialized underwater lighting manufacturer focusing on technical diving applications.",
      tags: ["Equipment", "Lighting", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "SeaYa",
      url: "https://seaya.com/en",
      description: "Underwater lighting manufacturer offering technical diving lights and accessories.",
      tags: ["Equipment", "Lighting", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "OrcaTorch",
      url: "https://www.orcatorch.com",
      description: "Underwater lighting manufacturer with technical diving lights and video lighting systems.",
      tags: ["Equipment", "Lighting", "Technical Diving", "Video"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Tovatec",
      url: "https://tovatec.com/collections/lights",
      description: "Underwater lighting manufacturer offering technical diving lights and camera accessories.",
      tags: ["Equipment", "Lighting", "Technical Diving", "Photography"],
      category: "Equipment Manufacturers"
    },

    // Additional Rebreather Manufacturers
    {
      name: "XCCR",
      url: "https://www.xccrrebreather.com",
      description: "Advanced rebreather manufacturer known for innovative CCR designs and technical diving applications.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Innerspace Systems Corp (Meg)",
      url: "https://megccr.com",
      description: "Manufacturer of the Meg rebreather, popular among technical divers for its reliability and performance.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Triton CCR",
      url: "https://en.ccrtriton.com",
      description: "Rebreather manufacturer offering technical diving CCR systems with advanced features.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Lungfish Dive Systems",
      url: "https://www.lungfishdivesystems.com",
      description: "Specialized rebreather manufacturer focusing on technical and military diving applications.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Fathom CCR",
      url: "https://www.fathomdive.com/fathom-ccr",
      description: "Advanced rebreather manufacturer known for innovative CCR technology and technical diving features.",
      tags: ["Equipment", "Rebreather", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Rebreather Lab (Pelagian)",
      url: "http://www.rebreatherlab.com/pelagian.htm",
      description: "Manufacturer of the Pelagian DCR (Diver Carried Rebreather) for technical and cave diving.",
      tags: ["Equipment", "Rebreather", "Technical Diving", "Cave Diving"],
      category: "Equipment Manufacturers"
    },

    // DPV Manufacturers
    {
      name: "Seacraft EU",
      url: "https://seacraft.eu",
      description: "European DPV manufacturer known for high-performance technical diving scooters and underwater propulsion vehicles.",
      tags: ["Equipment", "DPV", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Seacraft North America",
      url: "https://seacraftdpv.com",
      description: "North American distributor of Seacraft high-performance technical diving DPVs and underwater propulsion vehicles.",
      tags: ["Equipment", "DPV", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Subgravity DPV",
      url: "https://dpv.sub-gravity.com",
      description: "DPV manufacturer offering underwater propulsion vehicles for technical and cave diving applications.",
      tags: ["Equipment", "DPV", "Technical Diving", "Cave Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Dive Xtras",
      url: "https://dive-xtras.com",
      description: "American DPV manufacturer specializing in technical diving scooters and underwater propulsion systems.",
      tags: ["Equipment", "DPV", "Technical Diving"],
      category: "Equipment Manufacturers"
    },
    {
      name: "Gavin Scooters",
      url: "https://gavinscooters.com/en",
      description: "Manufacturer of high-performance DPVs popular among cave divers and technical diving professionals.",
      tags: ["Equipment", "DPV", "Technical Diving", "Cave Diving"],
      category: "Equipment Manufacturers"
    },

    // Technical Equipment Suppliers
    {
      name: "Northeast Scuba Supply",
      url: "https://northeastscubasupply.com",
      description: "US technical diving equipment supplier with comprehensive selection of technical diving gear and training materials.",
      tags: ["Shop", "Technical Diving", "Equipment", "US"],
      category: "Equipment Suppliers"
    },
    {
      name: "Tec-Divesysteme",
      url: "https://www.tec-divesysteme.com/en",
      description: "European technical diving equipment supplier specializing in technical diving gear, training, and certification.",
      tags: ["Shop", "Technical Diving", "Equipment", "Training", "Europe"],
      category: "Equipment Suppliers"
    },
    {
      name: "Dive Right in Scuba",
      url: "https://www.diverightinscuba.com/techequipment-c-363.html",
      description: "Technical diving equipment supplier with comprehensive selection of technical diving gear and accessories.",
      tags: ["Shop", "Technical Diving", "Equipment"],
      category: "Equipment Suppliers"
    },
    {
      name: "Tecdivegear",
      url: "https://tecdivegear.com",
      description: "Specialized technical diving equipment supplier focusing on technical diving gear and accessories.",
      tags: ["Shop", "Technical Diving", "Equipment"],
      category: "Equipment Suppliers"
    },
    {
      name: "Deepstop (EU)",
      url: "https://www.deepstop.de/en",
      description: "European technical diving equipment supplier with comprehensive technical diving gear selection.",
      tags: ["Shop", "Technical Diving", "Equipment", "Europe"],
      category: "Equipment Suppliers"
    },
    {
      name: "Dive Gear Express",
      url: "https://www.divegearexpress.com",
      description: "Technical diving equipment supplier known for competitive pricing and comprehensive technical gear selection.",
      tags: ["Shop", "Technical Diving", "Equipment"],
      category: "Equipment Suppliers"
    },
    {
      name: "Lucas Dive Store (EU)",
      url: "https://www.lucasdivestore.com/en/technical-diving",
      description: "European technical diving equipment supplier with focus on technical diving gear and training equipment.",
      tags: ["Shop", "Technical Diving", "Equipment", "Europe"],
      category: "Equipment Suppliers"
    },
    {
      name: "Aquanauts (UK)",
      url: "https://www.aquanauts.co.uk",
      description: "UK technical diving equipment supplier and training center with comprehensive technical diving services.",
      tags: ["Shop", "Technical Diving", "Equipment", "Training", "UK"],
      category: "Equipment Suppliers"
    },
    {
      name: "Narked at 90 (UK)",
      url: "https://www.narkedat90.com",
      description: "UK technical diving equipment supplier specializing in technical diving gear, training, and dive planning.",
      tags: ["Shop", "Technical Diving", "Equipment", "Training", "UK"],
      category: "Equipment Suppliers"
    },
    {
      name: "Divelife (UK)",
      url: "https://divelife.co.uk",
      description: "UK diving equipment supplier with strong focus on technical diving gear and professional equipment.",
      tags: ["Shop", "Technical Diving", "Equipment", "UK"],
      category: "Equipment Suppliers"
    },
    {
      name: "Mike's Dive Store (UK)",
      url: "https://www.mikesdivestore.com",
      description: "UK diving equipment supplier offering technical diving gear and professional diving equipment.",
      tags: ["Shop", "Technical Diving", "Equipment", "UK"],
      category: "Equipment Suppliers"
    },
    {
      name: "Shop4Divers (EU)",
      url: "https://shop4divers.eu",
      description: "European diving equipment supplier with comprehensive technical diving equipment selection.",
      tags: ["Shop", "Technical Diving", "Equipment", "Europe"],
      category: "Equipment Suppliers"
    },
    {
      name: "Dare To Dive (EU)",
      url: "https://eshop.daretodive.eu",
      description: "European technical diving equipment supplier specializing in technical diving gear and accessories.",
      tags: ["Shop", "Technical Diving", "Equipment", "Europe"],
      category: "Equipment Suppliers"
    },

    // Publications
    {
      name: "X-Ray Magazine",
      url: "https://xray-mag.com",
      description: "Free international diving magazine with technical diving coverage and underwater photography.",
      tags: ["Publication", "Technical Diving", "Photography"],
      category: "Publications"
    },
    {
      name: "Advanced Diver Magazine",
      url: "https://advanceddiver.com", 
      description: "Technical diving publication covering advanced techniques, equipment reviews, and safety.",
      tags: ["Publication", "Technical Diving", "Equipment"],
      category: "Publications"
    },
    {
      name: "Quest Magazine",
      url: "https://quest.naui.org",
      description: "NAUI's official publication with technical diving articles and industry updates.",
      tags: ["Publication", "Training", "Technical Diving"],
      category: "Publications"
    },

    // Blogs & Personal Websites
    {
      name: "The Technical Diver",
      url: "https://thetechnicaldiver.com",
      description: "Essential technical diving resources including comprehensive links, calculators, training materials, equipment reviews, and educational content.",
      tags: ["Blog", "Technical Diving", "Training", "Equipment", "Resources", "Diveblendr Recommended"],
      category: "Blogs & Personal Websites"
    },
    {
      name: "The Theoretical Diver",
      url: "https://thetheoreticaldiver.org/",
      description: "Focused on theory of technical diving to include more in-depth musings about math, theory and why we make certain choices",
      tags: ["Blog", "Technical Diving", "Training", "Equipment", "Resources", "Diveblendr Recommended"],
      category: "Blogs & Personal Websites"
    },
    {
      name: "Rod MacDonald",
      url: "https://rod-macdonald.com",
      description: "World-renowned shipwreck explorer, technical diving author of iconic books like 'Dive Scapa Flow' and 'Dive Truk Lagoon', and inspirational speaker.",
      tags: ["Blog", "Technical Diving", "Shipwreck", "Author", "Photography"],
      category: "Blogs & Personal Websites"
    },
    {
      name: "All Things Diving (ATD)",
      url: "https://allthingsdiving.com/en",
      description: "Comprehensive diving website with useful calculators for MOD, EAD, trimix calculations, and equipment service manuals.",
      tags: ["Tools", "Calculators", "Technical Diving", "Trimix", "Equipment"],
      category: "Blogs & Personal Websites"
    },
    {
      name: "The Rebreather Site",
      url: "http://www.therebreathersite.nl",
      description: "Fascinating collection of rebreather information spanning 17+ years with 1500+ pages covering most rebreathers built worldwide, reviews, and historical documentation.",
      tags: ["Rebreather", "Technical Diving", "History", "Reviews"],
      category: "Blogs & Personal Websites"
    },
    {
      name: "Cave Diving Blog",
      url: "https://www.cavediving.com/blog",
      description: "Specialized blog focusing on cave diving techniques, safety, exploration, and training.",
      tags: ["Blog", "Cave Diving", "Technical Diving", "Safety"],
      category: "Blogs & Personal Websites"
    },

    // YouTube Channels
    {
      name: "GUE Divers YouTube Channel",
      url: "https://www.youtube.com/@GUEdivers",
      description: "Official YouTube channel of Global Underwater Explorers with technical diving skills, training videos, and educational content.",
      tags: ["YouTube", "Training", "Technical Diving", "DIR", "GUE"],
      category: "YouTube Channels"
    },
    {
      name: "Richard Harris YouTube",
      url: "https://www.youtube.com/playlist?list=PLeSAix3wSmiVOlY87QSM_n_BLRPOVe66q",
      description: "Technical diver, diving physician, and anaesthetist sharing expertise in technical diving and dive medicine.",
      tags: ["YouTube", "Technical Diving", "Medical", "Cave Diving"],
      category: "YouTube Channels"
    },
    {
      name: "Rod MacDonald YouTube",
      url: "https://www.youtube.com/@rodmacdonald6396",
      description: "Shipwreck exploration videos and technical diving content from renowned author and explorer Rod MacDonald.",
      tags: ["YouTube", "Technical Diving", "Shipwreck", "Exploration"],
      category: "YouTube Channels"
    },
    {
      name: "Arctic Ice Divers",
      url: "https://www.youtube.com/@arcticicedivers7001/videos",
      description: "Specialized channel focusing on ice diving techniques, polar diving expeditions, and extreme environment diving.",
      tags: ["YouTube", "Ice Diving", "Technical Diving", "Exploration"],
      category: "YouTube Channels"
    },

    // Medical & Safety Resources
    {
      name: "Diving & Hyperbaric Medical Journal (DHMJ)",
      url: "https://www.dhmjournal.com/index.php/full-journals-embargoed/full-journals",
      description: "Access to back issues of the premier diving medicine journal with research on decompression, diving physiology, and medical aspects.",
      tags: ["Medical", "Research", "Safety", "Physiology"],
      category: "Medical & Safety Resources"
    },
    {
      name: "Undersea & Hyperbaric Medical Society (UHMS)",
      url: "https://www.uhms.org/publications/uhm-journal/download-uhm-journal-pdfs.html",
      description: "Access to back issues of the Undersea & Hyperbaric Medicine journal, the leading resource for diving medicine research.",
      tags: ["Medical", "Research", "Safety", "Hyperbaric Medicine"],
      category: "Medical & Safety Resources"
    },
    {
      name: "Fit to Dive",
      url: "https://www.fittodive.org",
      description: "Medical fitness for diving resources, health assessments, and diving medical guidance.",
      tags: ["Medical", "Safety", "Health", "Fitness"],
      category: "Medical & Safety Resources"
    }
  ], [])

  const allCombinedResources = useMemo(() => {
    const shopResources: Resource[] = [
      {
        name: "Blue Marlin Dive, Gili Trawangan",
        url: "https://www.bluemarlindivetech.com",
        description: "Technical diving shop in Gili Trawangan, Indonesia offering TDI, SSI technical courses including trimix and rebreather training.",
        tags: ["Shop", "Training", "Technical Diving", "Trimix", "Rebreather", "Indonesia"],
        category: "Community Resources"
      },
      {
        name: "BlackwaterTek",
        url: "https://blackwatertek.com/",
        description: "Providing gold standard CCR and technical diver training with unique travel opportunities.",
        tags: ["Training", "Technical Diving", "Trimix", "Rebreather"],
        category: "Community Resources"
      }
    ]
    return [...allResources, ...shopResources]
  }, [allResources])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    allCombinedResources.forEach(resource => {
      resource.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [allCombinedResources])

  const filteredResources = useMemo(() => {
    return allCombinedResources.filter(resource => {
      const matchesSearch = !searchTerm || 
        resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesFilters = selectedFilters.length === 0 || 
        selectedFilters.some(filter => resource.tags.includes(filter))
      
      return matchesSearch && matchesFilters
    })
  }, [allCombinedResources, searchTerm, selectedFilters])

  const groupedResources = useMemo(() => {
    const grouped: Record<string, Resource[]> = {}
    filteredResources.forEach(resource => {
      if (!grouped[resource.category]) {
        grouped[resource.category] = []
      }
      grouped[resource.category].push(resource)
    })
    return grouped
  }, [filteredResources])

  const toggleFilter = (tag: string) => {
    setSelectedFilters(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const getChipVariant = (tag: string) => {
    switch (tag.toLowerCase()) {
      case 'rebreather': return 'rebreather'
      case 'technical diving': return 'technical'
      case 'trimix': return 'trimix'
      case 'training': return 'training'
      case 'forum': return 'forum'
      case 'equipment': return 'equipment'
      case 'publication': return 'publication'
      case 'shop': return 'equipment'
      case 'diveblendr recommended': return 'recommended'
      default: return 'other'
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-yellow-400 mb-2">Technical Diving Resources</h2>
        <p className="text-gray-300">Comprehensive links to training organizations, forums, manufacturers, and publications</p>
      </div>

      {/* Submission Banner */}
      <div className="bg-gradient-to-r from-yellow-900 to-yellow-800 border border-yellow-600 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-yellow-200 mb-1">📋 List Your Business</h3>
            <p className="text-yellow-300 text-sm">
              Are you a dive shop, instructor, or technical diving resource? Submit your information to be included in our community section.
            </p>
          </div>
          <button
            onClick={() => setShowSubmissionForm(!showSubmissionForm)}
            className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            {showSubmissionForm ? 'Hide Form' : 'Submit Resource'}
          </button>
        </div>
        
        {showSubmissionForm && (
          <div className="mt-4 pt-4 border-t border-yellow-600">
            <p className="text-yellow-200 text-sm">
              <strong>To submit your resource:</strong> Use the feedback form (? button in the top-right corner) 
              and include your business name, website, description, and relevant tags (Training, Rebreather, Trimix, etc.). 
              Please mention &quot;Resource Submission&quot; in your message so we can add you to the community section.
            </p>
          </div>
        )}
      </div>

      {/* Search and Filter */}
      <div className="space-y-4">
        {/* Search Field */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-400 focus:border-yellow-400 focus:outline-none"
          />
          <div className="absolute right-3 top-2.5 text-gray-400">
            🔍
          </div>
        </div>

        {/* Filter Chips */}
        <div>
          <p className="text-sm text-gray-300 mb-2">Filter by category:</p>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                variant={getChipVariant(tag)}
                size="sm"
                onClick={() => toggleFilter(tag)}
                isSelected={selectedFilters.includes(tag)}
              />
            ))}
          </div>
        </div>
        
        {/* Clear Filters */}
        {(searchTerm || selectedFilters.length > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {filteredResources.length} of {allCombinedResources.length} resources
            </span>
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedFilters([])
              }}
              className="text-sm text-yellow-400 hover:text-yellow-300"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Resources by Category */}
      <div className="space-y-6">
        {Object.entries(groupedResources).map(([category, resources]) => (
          <section key={category}>
            <h3 className="text-xl font-semibold text-yellow-400 mb-4 border-b border-gray-600 pb-2">
              {category === 'Training Organizations' && '🎓 '}
              {category === 'Forums & Resources' && '💬 '}
              {category === 'Equipment Manufacturers' && '🔧 '}
              {category === 'Equipment Suppliers' && '🛒 '}
              {category === 'Publications' && '📖 '}
              {category === 'Blogs & Personal Websites' && '✍️ '}
              {category === 'YouTube Channels' && '📺 '}
              {category === 'Medical & Safety Resources' && '⚕️ '}
              {category === 'Community Resources' && '🏪 '}
              {category}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resources.map((resource, index) => (
                <div key={index} className="bg-gray-700 border border-gray-600 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-white mb-2">
                    <a 
                      href={resource.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-yellow-400 transition-colors"
                    >
                      {resource.name} ↗
                    </a>
                  </h4>
                  <p className="text-gray-300 text-sm mb-3">{resource.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {resource.tags.map(tag => (
                      <Chip
                        key={tag}
                        label={tag}
                        variant={getChipVariant(tag)}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>


      {/* Safety Notice */}
      <div className="p-4 bg-amber-900 border border-amber-600 rounded-lg">
        <p className="text-amber-200 text-sm">
          <strong className="text-amber-300">⚠️ Important:</strong> These links are provided for educational purposes. 
          Always verify training requirements with your chosen agency and dive within your certification limits. 
          Technical diving carries significant risks and requires proper training and experience.
        </p>
      </div>
    </div>
  )
}