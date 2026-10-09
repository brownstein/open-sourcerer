import { FC, useCallback, useState } from "react";

import { licenseData } from "./licenseData";
import { licenseTexts } from "./licenseTexts";

import "./CreditsScreen.less";

interface Contributor {
  name: string;
  github?: string;
}

interface CreditSection {
  heading: string;
  entries: (string | Contributor)[];
}

// Sorted by number of git contributions (combined across aliases)
const softwareEngineeringTeam: Contributor[] = [
  { name: "Robert Brownstein", github: "brownstein" },
  { name: "Alvin Bontuyan", github: "Alvin21Bon" },
  { name: "Leonardo da Luz", github: "LeonardoDaLuz" },
  { name: "Michael Rigali", github: "MichaelRigali" },
  { name: "Cristobal Cortés Gómez", github: "legocris" },
  { name: "VolcWolf", github: "volcwolf" },
  { name: "Pegasussx", github: "pegasussx" },
  { name: "Andre Livsey", github: "alivsey87" },
  { name: "DataPlant", github: "DataPlant" },
  { name: "Knowledge" },
  { name: "Imai Jiro", github: "ImaiJiro" },
  { name: "JustAnotherDevv", github: "JustAnotherDevv" },
  { name: "Anthony", github: "ZT2wo" },
  { name: "Jordan Ugalde", github: "jugalde" },
  { name: "Patrick Carvalho", github: "syswaregames" },
];

const artTeam: (Contributor | string)[] = [
  "Jan-Nikolay Jäckel (aka Hatwolf)",
  "Bruno Gomez",
  "Pablo Gonzalez",
  "Santiago Lopera",
  "Kerstin Schmidbauer",
  "Eduardo Rizzo Studio",
  "Anthony J Ravenda",
  "Kaio Oliveira",
  "Pedro Braga Vasconcelos",
  "Cristina Carvalho Sena",
  { name: "Braden Brown", github: "Doxis1" },
  { name: "TempleSlug", github: "TempleSlug" }
];

const creditsSections: CreditSection[] = [
  {
    heading: "Engineering",
    entries: softwareEngineeringTeam,
  },
  {
    heading: "Art",
    entries: artTeam,
  },
  {
    heading: "Writing",
    entries: [
      "Christian Kenneth Holzmann",
      "Enzo Crichi",
      "Whitney Gray Allen"
    ],
  },
];

const contractedStudios = [
  "MLC Studios (multiple visual assets)",
  "Peacox (multiple visual assets)",
];

const thirdPartyAssets: CreditSection[] = [
  {
    heading: "Visual Assets",
    entries: [
      "Deer asset by Calciumtrice, usable under Creative Commons Attribution 3.0 license.",
      "Fox asset by HDST",
      "Bandit asset by Jericho (C)",
      "Forest asset by Leon Avendaño (C)",
    ],
  },
  {
    heading: "Sounds",
    entries: [
      "got item: @listener4me (opengameart)",
      "keyboard prompts: Nicolae (Xelu) Berbece",
    ],
  },
];

function renderEntry(entry: string | Contributor, index: number) {
  if (typeof entry === "string") {
    return (
      <div key={index} className="credits-entry">
        <span>{entry}</span>
      </div>
    );
  }
  return (
    <div key={entry.name} className="credits-entry">
      {entry.github ? (
        <a
          href={`https://github.com/${entry.github}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {entry.name}
        </a>
      ) : (
        <span>{entry.name}</span>
      )}
    </div>
  );
}

interface CreditsScreenProps {
  onBack: () => void;
}

export const CreditsScreen: FC<CreditsScreenProps> = ({ onBack }) => {
  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  const [licensesExpanded, setLicensesExpanded] = useState(false);
  const [expandedLicenses, setExpandedLicenses] = useState<Set<string>>(
    new Set()
  );

  const toggleLicense = (license: string) => {
    setExpandedLicenses((prev) => {
      const next = new Set(prev);
      if (next.has(license)) {
        next.delete(license);
      } else {
        next.add(license);
      }
      return next;
    });
  };

  return (
    <div className="credits-screen">
      <div className="credits-scroll-container">
        <h2>Credits</h2>

        <div className="credits-group">
          <h3>Core Team</h3>
          {creditsSections.map((section) => (
            <div key={section.heading} className="credits-section">
              <h4>{section.heading}</h4>
              <div className="credits-list">
                {section.entries.map((e, i) => renderEntry(e, i))}
              </div>
            </div>
          ))}
        </div>

        <div className="credits-group">
          <h3>Contracted Studios</h3>
          <div className="credits-list">
            {contractedStudios.map((s, i) => (
              <div key={i} className="credits-entry">
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="credits-group">
          <h3>Third Party Assets</h3>
          {thirdPartyAssets.map((section) => (
            <div key={section.heading} className="credits-section">
              <h4>{section.heading}</h4>
              <div className="credits-list">
                {section.entries.map((e, i) => renderEntry(e, i))}
              </div>
            </div>
          ))}
        </div>

        <div className="licenses-section">
          <button
            className="licenses-toggle"
            onClick={() => setLicensesExpanded(!licensesExpanded)}
          >
            {licensesExpanded ? "▾" : "▸"} Open Source Licenses
          </button>

          {licensesExpanded && (
            <div className="licenses-content">
              {licenseData.map((group) => {
                const isExpanded = expandedLicenses.has(group.license);
                const hasText = group.license in licenseTexts;
                return (
                  <div key={group.license} className="license-row">
                    <button
                      className="license-row-toggle"
                      onClick={() => toggleLicense(group.license)}
                    >
                      <span className="license-row-arrow">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      <span className="license-row-name">
                        {group.license}
                      </span>
                      <span className="license-row-count">
                        {group.packages.length}{" "}
                        {group.packages.length === 1 ? "package" : "packages"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="license-row-detail">
                        {hasText && (
                          <pre className="license-text">
                            {licenseTexts[group.license]}
                          </pre>
                        )}
                        <div className="package-names">
                          {group.packages.join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button className="back-btn" onClick={handleBack}>
          Back
        </button>
      </div>
    </div>
  );
};
