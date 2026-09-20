import type { Metadata } from "next";
import Image from "next/image";
export const metadata:Metadata={title:"Inspiration",description:"The AvenFurniture journal: rooms, makers, materials, and considered living."};
const stories=[
  ["A quieter kind of luxury","At home with designer Mai Le","https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85","Homes"],
  ["Why walnut endures","A material with memory and depth","https://images.unsplash.com/photo-1615873968403-89e068629265?auto=format&fit=crop&w=1200&q=85","Materials"],
  ["The art of arrangement","Finding rhythm through objects and space","https://images.unsplash.com/photo-1615529182904-14819c35db37?auto=format&fit=crop&w=1200&q=85","Ideas"],
  ["Inside the workshop","The patient craft behind every curve","https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1200&q=85","Makers"],
  ["Light as a material","Shaping atmosphere from morning to evening","https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85","Ideas"],
];
export default function InspirationPage(){return <><header className="page-hero journal-hero"><div className="container"><p className="section-note">The Aven journal</p><h1>Rooms, materials,<br/>and ways of living</h1><p>Notes on the details that turn a space into a home.</p></div></header><section className="section journal-grid container">{stories.map(([title,desc,image,tag],i)=><article className={i===0?"story-feature":"story-card"} key={title}><div className="story-image"><Image src={image} alt="Considered contemporary interior" fill sizes={i===0?"100vw":"(max-width: 768px) 100vw, 50vw"}/></div><div><p className="section-note">{tag}</p><h2>{title}</h2><p>{desc}</p><button className="text-link">Read story</button></div></article>)}</section></>}
