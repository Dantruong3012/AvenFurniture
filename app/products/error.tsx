"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="container section empty-state" role="alert"><h2>Catalog is temporarily unavailable</h2><p>Please try again.</p><button className="btn btn-primary" onClick={reset}>Retry</button></div>; }
