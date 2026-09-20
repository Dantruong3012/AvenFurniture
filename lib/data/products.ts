import type { Collection, Product } from "@/lib/types";

const rooms = [
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=85",
];

const raw: Array<Omit<Product, "id" | "gallery" | "status">> = [
  ["Arden Modular Sofa","arden-modular-sofa","Sofas","Living","A low, generous modular sofa shaped for unhurried evenings and adaptable rooms.",4850,5600,"Bouclé and solid oak","Oat","W 284 × D 104 × H 72 cm",8,true,"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=85","New"],
  ["Elara Lounge Chair","elara-lounge-chair","Lounge Chairs","Living","A sculptural lounge chair with a soft wraparound back and considered oak joinery.",1890,undefined,"Wool and white oak","Moss","W 82 × D 84 × H 76 cm",12,true,"https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=85","Signature"],
  ["Sora Oak Dining Table","sora-oak-dining-table","Dining Tables","Dining","A monolithic dining table softened by radiused edges and beautifully matched grain.",3920,undefined,"Solid European oak","Natural oak","W 220 × D 96 × H 75 cm",5,true,"https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Vale Travertine Table","vale-travertine-table","Coffee Tables","Living","Honest stone, quiet proportions, and an inset base create a grounded centrepiece.",2160,2480,"Honed travertine","Warm ivory","W 120 × D 70 × H 34 cm",4,true,"https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=1200&q=85","Limited"],
  ["Noma Sideboard","noma-sideboard","Cabinets","Contemporary","Fluted walnut doors conceal generous storage behind a calm architectural facade.",3280,undefined,"American walnut and brass","Walnut","W 180 × D 46 × H 78 cm",7,true,"https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Mira Dining Chair","mira-dining-chair","Dining Chairs","Dining","A precise timber frame with a hand-woven paper cord seat made for daily rituals.",720,undefined,"Oak and paper cord","Natural","W 52 × D 55 × H 79 cm",24,false,"https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Onda Arc Floor Lamp","onda-arc-floor-lamp","Lighting","Contemporary","An elegant arc casts warm, focused light across a reading chair or dining table.",980,undefined,"Powder-coated steel","Charcoal","W 48 × D 110 × H 192 cm",13,false,"https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Cove Platform Bed","cove-platform-bed","Beds","Bedroom","A floating timber plinth and upholstered headboard bring ease to the bedroom.",3550,undefined,"Walnut and linen","Sand","Queen · W 168 × L 226 × H 92 cm",6,true,"https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Luma Pendant","luma-pendant","Lighting","Natural Materials","A hand-finished pendant that balances soft ambient light with graphic form.",640,undefined,"Rice paper and steel","Parchment","Ø 62 × H 38 cm",18,false,"https://images.unsplash.com/photo-1540932239986-30128078f3c5?auto=format&fit=crop&w=1200&q=85","New"],
  ["Aster Console","aster-console","Cabinets","Contemporary","A slender console with twin drawers and an expressive stone top.",1740,undefined,"Smoked oak and limestone","Espresso","W 140 × D 38 × H 82 cm",9,false,"https://images.unsplash.com/photo-1538688423619-a81d3f23454b?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Tova Lounge Chair","tova-lounge-chair","Lounge Chairs","Scandinavian","Deep comfort meets a crisp Scandinavian frame in this fireside chair.",1650,1950,"Linen and ash","Clay","W 78 × D 86 × H 79 cm",10,true,"https://images.unsplash.com/photo-1519947486511-46149fa0a254?auto=format&fit=crop&w=1200&q=85","Sale"],
  ["Kanso Shelving","kanso-shelving","Shelving","Workspace","An open shelving system that gives books, objects, and negative space equal weight.",2380,undefined,"Solid ash","Blackened ash","W 160 × D 38 × H 196 cm",5,false,"https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Rhea Sectional","rhea-sectional","Sofas","Living","A softly tailored sectional designed for long conversations and changing spaces.",6250,undefined,"Performance linen","Stone","W 326 × D 180 × H 74 cm",3,true,"https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Orin Dining Chair","orin-dining-chair","Dining Chairs","Contemporary","A slender upholstered chair with a curved back that supports without heaviness.",680,undefined,"Wool and steel","Graphite","W 49 × D 53 × H 81 cm",31,false,"https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Tessell Coffee Table","tessell-coffee-table","Coffee Tables","Contemporary","Two interlocking planes create a table that changes from every angle.",1480,undefined,"Smoked glass and walnut","Smoke","W 105 × D 65 × H 32 cm",8,false,"https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Eira Bedside Table","eira-bedside-table","Cabinets","Bedroom","Compact bedside storage with a tactile linen drawer and floating oak shelf.",890,undefined,"Oak and linen","Bone","W 48 × D 40 × H 51 cm",16,false,"https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Solace Bench","solace-bench","Accessories","Bedroom","A softly upholstered bench balanced on a recessed solid timber frame.",1120,undefined,"Linen and walnut","Flax","W 138 × D 46 × H 44 cm",11,false,"https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Alba Table Lamp","alba-table-lamp","Lighting","Natural Materials","A carved stone base and linen shade create a warm pool of evening light.",520,undefined,"Limestone and linen","Cream","Ø 36 × H 58 cm",22,false,"https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Rowan Writing Desk","rowan-writing-desk","Dining Tables","Workspace","A beautifully resolved desk with cable management and a hand-lined drawer.",2450,undefined,"Walnut and leather","Walnut","W 150 × D 68 × H 75 cm",6,true,"https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Fjord Armchair","fjord-armchair","Lounge Chairs","Scandinavian","A compact lounge chair with a generous seat and exposed timber arms.",1420,undefined,"Wool and oak","Deep blue","W 74 × D 80 × H 75 cm",14,false,"https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Haven Linen Sofa","haven-linen-sofa","Sofas","Natural Materials","Relaxed Belgian linen and feather-blend cushions in an enduring silhouette.",4390,undefined,"Belgian linen and oak","Chalk","W 236 × D 98 × H 78 cm",7,true,"https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Pillar Side Table","pillar-side-table","Coffee Tables","Contemporary","A small architectural table carved from a single visual volume of stone.",790,undefined,"Honed marble","Rosso","Ø 42 × H 48 cm",12,false,"https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Kiri Wall Shelf","kiri-wall-shelf","Shelving","Scandinavian","A light wall-mounted shelf with hidden fixings and refined edge detail.",460,undefined,"White oak","Natural","W 110 × D 24 × H 22 cm",19,false,"https://images.unsplash.com/photo-1583845112203-29329902332e?auto=format&fit=crop&w=1200&q=85",undefined],
  ["Aro Object Bowl","aro-object-bowl","Accessories","Natural Materials","A hand-turned vessel whose quiet irregularity reveals the maker’s touch.",280,undefined,"Travertine","Ivory","Ø 34 × H 11 cm",27,false,"https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1200&q=85",undefined],
].map((item) => {
  const [name,slug,category,collection,description,price,compareAtPrice,material,color,dimensions,stock,featured,image,badge] = item as [string,string,string,string,string,number,number|undefined,string,string,string,number,boolean,string,string|undefined];
  return { name,slug,category,collection,description,price,compareAtPrice,material,color,dimensions,stock,featured,image,badge };
});

export const seedProducts: Product[] = raw.map((product, index) => ({
  ...product,
  id: `aven-${String(index + 1).padStart(3, "0")}`,
  status: "active",
  gallery: [product.image, rooms[index % rooms.length], rooms[(index + 1) % rooms.length]],
}));

export const collections: Collection[] = [
  { name: "Living", slug: "living", description: "Quiet forms for the room where life gathers.", image: rooms[0] },
  { name: "Dining", slug: "dining", description: "Tables and seating shaped around daily rituals.", image: "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=85" },
  { name: "Bedroom", slug: "bedroom", description: "Calm, tactile pieces for restorative spaces.", image: rooms[2] },
  { name: "Workspace", slug: "workspace", description: "Considered utility for focused work at home.", image: "https://images.unsplash.com/photo-1593476550610-87baa860004a?auto=format&fit=crop&w=1200&q=85" },
  { name: "Scandinavian", slug: "scandinavian", description: "Light woods, honest construction, enduring ease.", image: "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=1200&q=85" },
  { name: "Contemporary", slug: "contemporary", description: "Architectural silhouettes for modern interiors.", image: "https://images.unsplash.com/photo-1615529162924-f8605388461d?auto=format&fit=crop&w=1200&q=85" },
  { name: "Natural Materials", slug: "natural-materials", description: "Stone, timber, linen, and the beauty of variation.", image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85" },
];

export const formatPrice = (price: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
