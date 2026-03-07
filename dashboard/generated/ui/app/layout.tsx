import './globals.css';
import './dashboard.css';

import React from 'react';
import Link from 'next/link';

import ConnectButton from '../src/components/ConnectButton';
import FooterDeploymentMeta from '../src/components/FooterDeploymentMeta';
import LivingGrid from '../src/components/LivingGrid';
import NetworkStatus from '../src/components/NetworkStatus';
import ThemeToggle from '../src/components/ThemeToggle';
import { ths } from '../src/lib/ths';

export const metadata = {
  title: `${ths.app.name} - Filecoin Cloud Benchmark`,
  description: 'Benchmark run registry and local operator dashboard'
};

const themeBootScript = `
(() => {
  try {
    const storageKey = 'TH_THEME';
    const stored = localStorage.getItem(storageKey);
    const resolved = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();
`;

export default function RootLayout(props: { children: React.ReactNode }) {
  const primaryCollection = ths.collections.find((collection) => collection.name === 'BenchmarkRun') ?? ths.collections[0] ?? null;
  const navCollections = ['BenchmarkRun', 'BenchmarkIncident', 'BenchmarkConfig']
    .flatMap((name) => {
      const collection = ths.collections.find((entry) => entry.name === name);
      return collection ? [collection] : [];
    });

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <div className="siteBackground" aria-hidden="true">
          <div className="siteGridLayer" />
          <LivingGrid />
        </div>
        <div className="container">
          <header className="navShell">
            <div className="nav">
              <Link className="brand" href="/">
                <div className="brandCopy">
                  <div className="eyebrow">/benchmark/ops</div>
                  <div className="brandIdentity">
                    <span className="brandWordText">
                      <span className="brandWordBase">five minute</span>
                      <span className="brandWordAccent">challenge</span>
                    </span>
                  </div>
                </div>
              </Link>
              <nav className="navRail" aria-label="Primary">
                <Link className="navRailLink" href="/">Overview</Link>
                {navCollections.map((collection) => (
                  <Link key={collection.name} className="navRailLink" href={`/${collection.name}/`}>
                    {collection.name}
                  </Link>
                ))}
                <a className="navRailLink" href="/.well-known/tokenhost/manifest.json">Manifest</a>
              </nav>
              <div className="controlCluster">
                <ThemeToggle />
                <ConnectButton />
                {primaryCollection ? <Link className="btn primary navCta" href={`/${primaryCollection.name}/`}>Open registry</Link> : null}
              </div>
            </div>
          </header>
          <main className="mainShell">
            <div className="siteContent">
              <NetworkStatus />
              {props.children}
            </div>
          </main>
          <footer className="siteFooter">
            <div className="siteShell">
              <div className="footerGrid">
                <div className="footerSection">
                  <h4 className="footerLabel">/views</h4>
                  <div className="footerList">
                    <Link className="footerLinkText" href="/">Overview</Link>
                    <Link className="footerLinkText" href="/BenchmarkRun/">BenchmarkRun</Link>
                    <Link className="footerLinkText" href="/BenchmarkIncident/">BenchmarkIncident</Link>
                    <Link className="footerLinkText" href="/BenchmarkConfig/">BenchmarkConfig</Link>
                  </div>
                </div>
                <div className="footerSection">
                  <h4 className="footerLabel">/evidence</h4>
                  <div className="footerList">
                    <Link className="footerLinkText" href="/BenchmarkEvidence/">BenchmarkEvidence</Link>
                    <Link className="footerLinkText" href="/BenchmarkArtifacts/">BenchmarkArtifacts</Link>
                    <Link className="footerLinkText" href="/BenchmarkFeedback/">BenchmarkFeedback</Link>
                    <a className="footerLinkText" href="/compiled/App.json">Compiled ABI</a>
                  </div>
                </div>
              </div>
              <FooterDeploymentMeta>
                <span className="badge">schema {ths.schemaVersion}</span>
              </FooterDeploymentMeta>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
