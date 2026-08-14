/**
 * @file destinationsData.js
 * @description Comprehensive directory of Singapore Areas, Planning Towns, Food Enclaves,
 * MRT stations, and Precincts.
 * 
 * Prioritizes intuitive area searching (e.g., "Serangoon Gardens", "Tanjong Pagar", "Katong", "Orchard").
 */

const COMMON_SINGAPORE_DESTINATIONS = [
  // --- NORTH-EAST REGION & DINING ENCLAVES ---
  { 
    id: 'area-serangoon-gardens',
    name: 'Serangoon Gardens (Chomp Chomp & myVillage)', 
    area: 'Serangoon Gardens', 
    region: 'North-East',
    type: 'Food Enclave & Town Centre', 
    address: '20 Kensington Park Road, Singapore 557269', 
    postal: '557269', 
    lat: 1.3644, 
    lng: 103.8665,
    description: 'Famous dining haven featuring Chomp Chomp Food Centre, myVillage Mall, and shophouse cafes.'
  },
  { 
    id: 'area-nex-serangoon',
    name: 'NEX & Serangoon Central', 
    area: 'Serangoon', 
    region: 'North-East',
    type: 'Regional Transport & Retail Hub', 
    address: '23 Serangoon Central, Singapore 556083', 
    postal: '556083', 
    lat: 1.3506, 
    lng: 103.8727,
    description: 'Major transit interchange and regional shopping mall.'
  },
  { 
    id: 'area-ang-mo-kio',
    name: 'Ang Mo Kio Hub & Town Centre', 
    area: 'Ang Mo Kio', 
    region: 'North-East',
    type: 'Town Centre & Interchange', 
    address: '53 Ang Mo Kio Avenue 3, Singapore 569933', 
    postal: '569933', 
    lat: 1.3691, 
    lng: 103.8485,
    description: 'Heartland central hub with AMK Hub, hawker centres, and markets.'
  },
  { 
    id: 'area-bishan',
    name: 'Bishan Junction 8 & Central', 
    area: 'Bishan', 
    region: 'Central / North-East',
    type: 'Town Centre & Transport Hub', 
    address: '9 Bishan Place, Singapore 579837', 
    postal: '579837', 
    lat: 1.3508, 
    lng: 103.8488,
    description: 'Central transport interchange with Junction 8 and Bishan Park.'
  },
  { 
    id: 'area-waterway-point',
    name: 'Waterway Point & Punggol Town', 
    area: 'Punggol', 
    region: 'North-East',
    type: 'Waterfront Town Centre', 
    address: '83 Punggol Central, Singapore 828761', 
    postal: '828761', 
    lat: 1.4067, 
    lng: 103.9022,
    description: 'Waterfront dining and retail centre connected to Punggol Waterway.'
  },
  { 
    id: 'area-compass-one',
    name: 'Compass One & Sengkang Central', 
    area: 'Sengkang', 
    region: 'North-East',
    type: 'Town Centre', 
    address: '1 Sengkang Square, Singapore 545078', 
    postal: '545078', 
    lat: 1.3916, 
    lng: 103.8945,
    description: 'Sengkang central transport hub and community centre.'
  },
  { 
    id: 'area-hougang-mall',
    name: 'Hougang Mall & Central', 
    area: 'Hougang', 
    region: 'North-East',
    type: 'Town Centre', 
    address: '90 Hougang Avenue 10, Singapore 538766', 
    postal: '538766', 
    lat: 1.3725, 
    lng: 103.8936,
    description: 'Heartland shopping and commercial centre.'
  },

  // --- CENTRAL & CBD ---
  { 
    id: 'area-orchard-road',
    name: 'ION Orchard & Orchard Road', 
    area: 'Orchard', 
    region: 'Central',
    type: 'Shopping & Commercial Hub', 
    address: '2 Orchard Turn, Singapore 238801', 
    postal: '238801', 
    lat: 1.3040, 
    lng: 103.8318,
    description: 'Prime retail boulevard with major luxury malls.'
  },
  { 
    id: 'area-takashimaya',
    name: 'Ngee Ann City / Takashimaya', 
    area: 'Orchard', 
    region: 'Central',
    type: 'Shopping Mall', 
    address: '391 Orchard Road, Singapore 238873', 
    postal: '238873', 
    lat: 1.3024, 
    lng: 103.8348,
    description: 'Flagship department store and dining hub.'
  },
  { 
    id: 'area-somerset',
    name: 'Somerset & 313@Somerset', 
    area: 'Orchard / Somerset', 
    region: 'Central',
    type: 'Youth & Retail Enclave', 
    address: '313 Orchard Road, Singapore 238895', 
    postal: '238895', 
    lat: 1.3010, 
    lng: 103.8385,
    description: 'Popular retail and cafe lifestyle strip.'
  },
  { 
    id: 'area-plaza-sing',
    name: 'Plaza Singapura & Dhoby Ghaut', 
    area: 'Dhoby Ghaut / Orchard', 
    region: 'Central',
    type: 'Shopping Mall & Interchange', 
    address: '68 Orchard Road, Singapore 238839', 
    postal: '238839', 
    lat: 1.3007, 
    lng: 103.8452,
    description: 'Triple-line MRT junction and 9-storey retail mall.'
  },
  { 
    id: 'area-mbs',
    name: 'Marina Bay Sands & Bayfront', 
    area: 'Marina Bay', 
    region: 'Central',
    type: 'Landmark / Commercial', 
    address: '10 Bayfront Avenue, Singapore 018956', 
    postal: '018956', 
    lat: 1.2838, 
    lng: 103.8591,
    description: 'Integrated resort, waterfront promenade, and luxury retail.'
  },
  { 
    id: 'area-raffles-place',
    name: 'Raffles Place CBD', 
    area: 'Downtown Core', 
    region: 'Central',
    type: 'Financial District', 
    address: 'Raffles Place, Singapore 048616', 
    postal: '048616', 
    lat: 1.2839, 
    lng: 103.8515,
    description: 'Singapore financial epicenter and business towers.'
  },
  { 
    id: 'area-tanjong-pagar',
    name: 'Tanjong Pagar & Duxton Hill', 
    area: 'Tanjong Pagar', 
    region: 'Central',
    type: 'Dining & Shophouse Enclave', 
    address: 'Tanjong Pagar Road, Singapore 088539', 
    postal: '088539', 
    lat: 1.2770, 
    lng: 103.8440,
    description: 'Vibrant dining, Korean BBQ, and heritage shophouse bars.'
  },
  { 
    id: 'area-telok-ayer',
    name: 'Telok Ayer & Amoy Street', 
    area: 'Telok Ayer', 
    region: 'Central',
    type: 'Dining & Heritage Enclave', 
    address: 'Telok Ayer Street, Singapore 068630', 
    postal: '068630', 
    lat: 1.2818, 
    lng: 103.8475,
    description: 'Popular lunch and post-work artisanal dining strip.'
  },
  { 
    id: 'area-chinatown',
    name: 'Chinatown & Maxwell Food Centre', 
    area: 'Chinatown', 
    region: 'Central',
    type: 'Cultural & Hawker Food Enclave', 
    address: '1 Kadayanallur Street, Singapore 069184', 
    postal: '069184', 
    lat: 1.2804, 
    lng: 103.8448,
    description: 'Historic district with Maxwell and Chinatown Complex Food Centres.'
  },
  { 
    id: 'area-tiong-bahru',
    name: 'Tiong Bahru Market & Heritage Estate', 
    area: 'Tiong Bahru', 
    region: 'Central',
    type: 'Art Deco / Food Enclave', 
    address: '30 Seng Poh Road, Singapore 168898', 
    postal: '168898', 
    lat: 1.2848, 
    lng: 103.8324,
    description: 'Iconic market, bakeries, and pre-war art deco residential estate.'
  },
  { 
    id: 'area-bugis',
    name: 'Bugis Junction & Haji Lane', 
    area: 'Bugis / Kampong Glam', 
    region: 'Central',
    type: 'Heritage & Lifestyle', 
    address: '200 Victoria Street, Singapore 188021', 
    postal: '188021', 
    lat: 1.2995, 
    lng: 103.8554,
    description: 'Trendy fashion lanes, cafes, and indoor glass-covered mall.'
  },
  { 
    id: 'area-suntec',
    name: 'Suntec City & Marina Square', 
    area: 'Marina Centre', 
    region: 'Central',
    type: 'Convention & Mega Retail', 
    address: '3 Temasek Boulevard, Singapore 038983', 
    postal: '038983', 
    lat: 1.2935, 
    lng: 103.8572,
    description: 'Fountain of Wealth, convention halls, and vast multi-storey carparks.'
  },
  { 
    id: 'area-holland-village',
    name: 'Holland Village & One Holland Village', 
    area: 'Holland Village', 
    region: 'Central / West',
    type: 'Dining & Lifestyle Enclave', 
    address: 'Lorong Mambong, Singapore 277684', 
    postal: '277684', 
    lat: 1.3113, 
    lng: 103.7958,
    description: 'Alfresco dining, pet-friendly mall, and bustling bars.'
  },

  // --- EAST REGION ---
  { 
    id: 'area-katong-joo-chiat',
    name: 'Katong & Joo Chiat (East Coast Rd)', 
    area: 'Katong', 
    region: 'East',
    type: 'Peranakan Food & Shophouse Enclave', 
    address: 'East Coast Road, Singapore 428796', 
    postal: '428796', 
    lat: 1.3052, 
    lng: 103.9022,
    description: 'Peranakan heritage, famous laksa, cafes, and Parkway Parade.'
  },
  { 
    id: 'area-tampines-central',
    name: 'Tampines Central & Our Tampines Hub (OTH)', 
    area: 'Tampines', 
    region: 'East',
    type: 'Regional Centre & Community Hub', 
    address: '1 Tampines Walk, Singapore 528523', 
    postal: '528523', 
    lat: 1.3533, 
    lng: 103.9402,
    description: 'Vast regional hub with 3 malls and 24-hour community facilities.'
  },
  { 
    id: 'area-bedok-central',
    name: 'Bedok Central & Bedok Mall', 
    area: 'Bedok', 
    region: 'East',
    type: 'Town Centre & Interchange', 
    address: '311 New Upper Changi Road, Singapore 467360', 
    postal: '467360', 
    lat: 1.3240, 
    lng: 103.9298,
    description: 'Bustling heartland town centre and hawker 85 Fengshan link.'
  },
  { 
    id: 'area-jewel-changi',
    name: 'Jewel Changi Airport', 
    area: 'Changi', 
    region: 'East',
    type: 'Airport / Retail Landmark', 
    address: '78 Airport Boulevard, Singapore 819666', 
    postal: '819666', 
    lat: 1.3602, 
    lng: 103.9897,
    description: 'World-renowned Rain Vortex and 280+ dining and retail outlets.'
  },
  { 
    id: 'area-east-coast-park',
    name: 'East Coast Park (Marine Cove / Parkland Green)', 
    area: 'East Coast', 
    region: 'East',
    type: 'Coastal Park & Dining', 
    address: 'East Coast Park Service Road, Singapore 449876', 
    postal: '449876', 
    lat: 1.3015, 
    lng: 103.9125,
    description: 'Beachfront cycling, seafood centre, and breezy park carparks.'
  },
  { 
    id: 'area-paya-lebar',
    name: 'Paya Lebar Quarter (PLQ)', 
    area: 'Paya Lebar', 
    region: 'East',
    type: 'Commercial & Retail Hub', 
    address: '10 Paya Lebar Road, Singapore 409057', 
    postal: '409057', 
    lat: 1.3175, 
    lng: 103.8924,
    description: 'Major East-West/Circle interchange hub with offices and plaza.'
  },

  // --- WEST REGION ---
  { 
    id: 'area-jurong-east',
    name: 'Jurong East (Westgate, Jem, IMM)', 
    area: 'Jurong East', 
    region: 'West',
    type: 'Commercial & Retail Hub', 
    address: '3 Gateway Drive, Singapore 608532', 
    postal: '608532', 
    lat: 1.3347, 
    lng: 103.7431,
    description: 'The CBD of the West, connecting Jem, Westgate, and IMM outlet mall.'
  },
  { 
    id: 'area-jurong-point',
    name: 'Jurong Point & Boon Lay', 
    area: 'Jurong West', 
    region: 'West',
    type: 'Town Centre & Mega Mall', 
    address: '1 Jurong West Central 2, Singapore 648886', 
    postal: '648886', 
    lat: 1.3398, 
    lng: 103.7067,
    description: 'Largest suburban mall in Singapore with Japanese/HK food streets.'
  },
  { 
    id: 'area-clementi',
    name: 'Clementi Town Centre & Mall', 
    area: 'Clementi', 
    region: 'West',
    type: 'Town Centre', 
    address: '3155 Commonwealth Avenue West, Singapore 129588', 
    postal: '129588', 
    lat: 1.3152, 
    lng: 103.7650,
    description: 'Heartland education and transit town centre.'
  },
  { 
    id: 'area-vivocity',
    name: 'VivoCity & HarbourFront', 
    area: 'HarbourFront', 
    region: 'South',
    type: 'Mega Mall & Sentosa Gateway', 
    address: '1 HarbourFront Walk, Singapore 098585', 
    postal: '098585', 
    lat: 1.2644, 
    lng: 103.8222,
    description: 'Singapore largest shopping mall facing Sentosa with vast parking.'
  },

  // --- NORTH REGION ---
  { 
    id: 'area-woodlands',
    name: 'Woodlands Central / Causeway Point', 
    area: 'Woodlands', 
    region: 'North',
    type: 'Regional Centre', 
    address: '1 Woodlands Square, Singapore 738099', 
    postal: '738099', 
    lat: 1.4361, 
    lng: 103.7860,
    description: 'Northern regional commercial hub and Johor Bahru gateway.'
  },
  { 
    id: 'area-northpoint',
    name: 'Northpoint City & Yishun Central', 
    area: 'Yishun', 
    region: 'North',
    type: 'Town Centre & Mega Mall', 
    address: '930 Yishun Avenue 2, Singapore 769098', 
    postal: '769098', 
    lat: 1.4295, 
    lng: 103.8361,
    description: 'Vast lifestyle hub with over 500 shops across North/South wings.'
  },
  { 
    id: 'area-toapayoh',
    name: 'Toa Payoh Central & Hub', 
    area: 'Toa Payoh', 
    region: 'Central',
    type: 'Town Centre & Hub', 
    address: '490 Lorong 6 Toa Payoh, Singapore 310490', 
    postal: '310490', 
    lat: 1.3325, 
    lng: 103.8480,
    description: 'Mature heartland hub with HDB Hub and bustling town square.'
  }
];

// Preset Quick Filter Area Chips
const POPULAR_SEARCH_AREAS = [
  'Serangoon Gardens',
  'Orchard',
  'Tanjong Pagar',
  'Bishan',
  'Ang Mo Kio',
  'Katong',
  'Tampines',
  'Jurong East',
  'Tiong Bahru',
  'Marina Bay',
  'Woodlands',
  'Punggol'
];
