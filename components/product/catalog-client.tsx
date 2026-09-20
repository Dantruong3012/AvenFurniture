"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductGrid } from "@/components/product/product-card";
import { useStore } from "@/components/store/store-provider";
import { Button } from "@/components/ui/button";
import { CloseIcon, FilterIcon, SearchIcon } from "@/components/ui/icons";

const categories = ["Sofas","Lounge Chairs","Dining Chairs","Dining Tables","Coffee Tables","Beds","Cabinets","Shelving","Lighting","Accessories"];
const materials = ["All","Oak","Walnut","Linen","Wool","Stone","Steel"];

export function CatalogClient() {
  const params = useSearchParams();
  const initialCollection = params.get("collection")?.replaceAll("-", " ") ?? "";
  const { products } = useStore();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [material, setMaterial] = useState("All");
  const [availability, setAvailability] = useState("all");
  const [maxPrice, setMaxPrice] = useState(7000);
  const [sort, setSort] = useState("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = useMemo(() => {
    const result = products.filter((p) => p.status === "active" && (!initialCollection || p.collection.toLowerCase() === initialCollection) && (category === "All" || p.category === category) && (material === "All" || p.material.toLowerCase().includes(material.toLowerCase())) && (availability === "all" || p.stock > 0) && p.price <= maxPrice && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
    return [...result].sort((a,b) => sort === "price-low" ? a.price-b.price : sort === "price-high" ? b.price-a.price : sort === "name" ? a.name.localeCompare(b.name) : Number(b.featured)-Number(a.featured));
  }, [products, initialCollection, category, material, availability, maxPrice, search, sort]);
  const clear = () => { setCategory("All"); setMaterial("All"); setAvailability("all"); setMaxPrice(7000); setSearch(""); };
  const filterBody = <>
    <fieldset className="filter-group"><legend>Category</legend>{["All",...categories].map((item) => <label key={item}><input type="radio" name="category" value={item} checked={category===item} onChange={() => setCategory(item)}/><span>{item}</span></label>)}</fieldset>
    <fieldset className="filter-group"><legend>Material</legend><select value={material} onChange={(e)=>setMaterial(e.target.value)}>{materials.map((m)=><option key={m}>{m}</option>)}</select></fieldset>
    <fieldset className="filter-group"><legend>Price up to <span>${maxPrice.toLocaleString()}</span></legend><input type="range" min="500" max="7000" step="250" value={maxPrice} onChange={(e)=>setMaxPrice(Number(e.target.value))}/></fieldset>
    <fieldset className="filter-group"><legend>Availability</legend><label><input type="checkbox" checked={availability==="stock"} onChange={(e)=>setAvailability(e.target.checked?"stock":"all")}/><span>In stock</span></label></fieldset>
    <Button variant="text" onClick={clear}>Clear all filters</Button>
  </>;
  return <div className="container catalog-shell">
    <div className="catalog-toolbar"><label className="catalog-search"><SearchIcon/><span className="sr-only">Search products</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by name or style"/></label><div className="catalog-controls"><button className="filter-trigger" onClick={()=>setFiltersOpen(true)}><FilterIcon/> Filters</button><label>Sort <select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label></div></div>
    <div className="catalog-layout"><aside className="filter-sidebar" aria-label="Product filters">{filterBody}</aside><section className="catalog-results"><p className="result-count">{filtered.length} {filtered.length===1?"piece":"pieces"}</p>{filtered.length ? <ProductGrid products={filtered}/> : <div className="empty-state"><h2>No pieces found</h2><p>Try widening your price range or clearing the current filters.</p><Button onClick={clear}>Clear filters</Button></div>}</section></div>
    <div className={`drawer-scrim ${filtersOpen?"open":""}`} onClick={()=>setFiltersOpen(false)}/><aside className={`filter-drawer ${filtersOpen?"open":""}`} aria-hidden={!filtersOpen}><div className="drawer-head"><h2>Filters</h2><button className="icon-button" onClick={()=>setFiltersOpen(false)} aria-label="Close filters"><CloseIcon/></button></div><div className="drawer-body">{filterBody}</div><Button onClick={()=>setFiltersOpen(false)}>Show {filtered.length} pieces</Button></aside>
  </div>;
}
