import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowIcon } from "@/components/ui/icons";
import { collections } from "@/lib/data/products";
export const metadata:Metadata={title:"Collections",description:"Curated furniture collections by room, material, and point of view."};
export default function CollectionsPage(){return <><header className="page-hero collection-hero"><div className="container"><p className="section-note">Curated worlds</p><h1>Collections with<br/>a sense of place</h1></div></header><section className="section"><div className="container collection-list">{collections.map((c,i)=><Link href={`/products?collection=${c.slug}`} className="collection-row" key={c.slug}><span className="collection-number">{String(i+1).padStart(2,"0")}</span><div className="collection-picture"><Image src={c.image} alt={`${c.name} collection interior`} fill sizes="(max-width: 768px) 100vw, 42vw"/></div><div className="collection-copy"><h2>{c.name}</h2><p>{c.description}</p><span className="inline-link">View collection <ArrowIcon/></span></div></Link>)}</div></section></>}
