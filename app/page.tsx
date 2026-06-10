"use client";

import { useState, useRef, useCallback } from "react";

interface JuiceboxResult {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  location: string;
  school: string;
  matchRate: number;
}

interface ResolvedRow {
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  location: string;
  school: string;
  matchRate: number;
  linkedinUrl: string;
}

function parseJuiceboxJSON(raw: string): JuiceboxResult[] {
  const data = JSON.parse(raw);
  const results = data.results || data;
  if (!Array.isArray(results)) throw new Error("No se encontró array de resultados");

  return results
    .filter((r: Record<string, unknown>) => r.id && typeof r.id === "string")
    .map((r: Record<string, unknown>) => {
      const p = (r.profileDetails || {}) as Record<string, unknown>;
      const fullName = ((p.full_name as string) || "").trim();
      const parts = fullName.split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      const school = (p.last_school as Record<string, unknown>)?.name as string || "";
      return {
        id: r.id as string,
        firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
        lastName: lastName.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        title: (p.job_title as string) || "",
        company: (p.job_company_name as string) || "",
        location: (p.location_name as string) || "",
        school,
        matchRate: (r.matchRateRounded as number) || (r.matchRate as number) || 0,
      };
    });
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toCSV(rows: ResolvedRow[]): string {
  const header = "First Name,Last Name,LinkedIn,Title,Company,Location,School,Match %";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map(
    (r) =>
      `${escape(r.firstName)},${escape(r.lastName)},${escape(r.linkedinUrl)},${escape(r.title)},${escape(r.company)},${escape(r.location)},${escape(r.school)},${r.matchRate}%`
  );
  return [header, ...lines].join("\n");
}

export default function Home() {
  const [token, setToken] = useState("");
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<JuiceboxResult[]>([]);
  const [results, setResults] = useState<ResolvedRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [minMatch, setMinMatch] = useState(80);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [rawJson, setRawJson] = useState("");
  const abortRef = useRef(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseJuiceboxJSON(e.target?.result as string);
        setEntries(parsed);
        setLog([`✓ ${parsed.length} perfiles encontrados en ${file.name}`]);
      } catch {
        setLog(["✗ Error al parsear el archivo. Asegúrate de subir el JSON de Juicebox."]);
        setEntries([]);
      }
    };
    reader.readAsText(file);
  }, []);

  const handlePaste = useCallback((text: string) => {
    setRawJson(text);
    try {
      const parsed = parseJuiceboxJSON(text);
      setEntries(parsed);
      setFileName("JSON pegado");
      setLog([`✓ ${parsed.length} perfiles encontrados`]);
    } catch {
      setLog(["✗ Error al parsear. Asegúrate de pegar JSON válido de Juicebox."]);
      setEntries([]);
    }
  }, []);

  const filteredEntries = entries.filter((e) => e.matchRate >= minMatch);

  const run = async () => {
    if (!token || filteredEntries.length === 0) return;
    setRunning(true);
    setResults([]);
    setLog([`Iniciando resolución (${filteredEntries.length} perfiles con match ≥ ${minMatch}%)...`]);
    abortRef.current = false;

    const total = filteredEntries.length;
    setProgress({ done: 0, total });
    const resolved: ResolvedRow[] = [];

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      const entry = filteredEntries[i];

      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, token }),
        });
        const data = await res.json();
        const url = data.linkedinUrl || "";

        resolved.push({
          firstName: entry.firstName,
          lastName: entry.lastName,
          title: entry.title,
          company: entry.company,
          location: entry.location,
          school: entry.school,
          matchRate: entry.matchRate,
          linkedinUrl: url,
        });

        setLog((prev) => [
          ...prev,
          `[${i + 1}/${total}] ${entry.firstName} ${entry.lastName} → ${url || "sin URL"}`,
        ]);
      } catch {
        resolved.push({
          firstName: entry.firstName,
          lastName: entry.lastName,
          title: entry.title,
          company: entry.company,
          location: entry.location,
          school: entry.school,
          matchRate: entry.matchRate,
          linkedinUrl: "",
        });
        setLog((prev) => [...prev, `[${i + 1}/${total}] ✗ Error: ${entry.firstName} ${entry.lastName}`]);
      }

      setProgress({ done: i + 1, total });
      setResults([...resolved]);

      // Extra random pause every 8-15 requests to mimic human browsing
      const burstSize = randomBetween(8, 15);
      if (i > 0 && i % burstSize === 0) {
        const pause = randomBetween(3000, 6000);
        setLog((prev: string[]) => [...prev, `⏸ Pausa de ${(pause / 1000).toFixed(1)}s...`]);
        await new Promise((r) => setTimeout(r, pause));
      }
    }

    setRunning(false);
    setLog((prev) => [
      ...prev,
      `\n✓ Listo — ${resolved.filter((r) => r.linkedinUrl).length}/${total} URLs resueltas`,
    ]);
  };

  const download = () => {
    const csv = toCSV(results);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkedin_resolved.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-slate-900 rounded-2xl p-8 w-full max-w-xl shadow-2xl">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
          Juicebox → LinkedIn
        </h1>
        <p className="text-slate-500 text-sm mt-1 mb-6">
          Sube el JSON de Juicebox y obtén las URLs reales de LinkedIn
        </p>

        {/* Token */}
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Token (fbauthorization)
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOi..."
          className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500 mb-5 transition"
        />

        {/* Min match rate */}
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Match Rate mínimo
        </label>
        <div className="flex items-center gap-3 mb-5">
          <input
            type="range"
            min={0}
            max={100}
            value={minMatch}
            onChange={(e) => setMinMatch(Number(e.target.value))}
            className="flex-1 accent-violet-500"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={minMatch}
            onChange={(e) => setMinMatch(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="w-16 px-2 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-center text-slate-200 focus:outline-none focus:border-violet-500"
          />
          <span className="text-sm text-slate-500">%</span>
          {entries.length > 0 && (
            <span className="text-xs text-slate-600">
              ({filteredEntries.length}/{entries.length})
            </span>
          )}
        </div>

        {/* Input mode tabs */}
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          JSON de Juicebox
        </label>
        <div className="flex gap-1 mb-3 bg-slate-950 rounded-lg p-1">
          <button
            onClick={() => setInputMode("file")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
              inputMode === "file"
                ? "bg-slate-800 text-slate-200"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Subir archivo
          </button>
          <button
            onClick={() => setInputMode("paste")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
              inputMode === "paste"
                ? "bg-slate-800 text-slate-200"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Pegar JSON
          </button>
        </div>

        {inputMode === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-violet-500");
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove("border-violet-500")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-violet-500");
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-5 ${
              entries.length > 0 && inputMode === "file"
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-slate-700 hover:border-violet-500"
            }`}
          >
            <input
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {entries.length > 0 ? (
              <>
                <div className="text-2xl mb-1">✓</div>
                <div className="text-emerald-400 font-semibold">{fileName}</div>
                <div className="text-slate-500 text-sm">{entries.length} perfiles</div>
              </>
            ) : (
              <>
                <div className="text-2xl mb-1">📁</div>
                <div className="text-slate-500 text-sm">
                  Arrastra aquí o haz clic para seleccionar
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mb-5">
            <textarea
              value={rawJson}
              onChange={(e) => handlePaste(e.target.value)}
              placeholder='{"results": [...]}'
              rows={6}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 focus:outline-none focus:border-violet-500 transition resize-y"
            />
            {entries.length > 0 && (
              <p className="text-xs text-emerald-400 mt-1">✓ {entries.length} perfiles encontrados</p>
            )}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={running || !token || filteredEntries.length === 0}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-[0.98] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {running
            ? `Resolviendo... ${pct}%`
            : `Resolver ${filteredEntries.length} LinkedIn URLs`}
        </button>

        {/* Progress */}
        {progress.total > 0 && (
          <div className="mt-5">
            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {progress.done} / {progress.total}
            </p>
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="mt-4 max-h-48 overflow-y-auto bg-slate-950 rounded-lg p-3 font-mono text-xs text-slate-500 leading-relaxed">
            {log.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("✓")
                    ? "text-emerald-400"
                    : line.includes("✗")
                    ? "text-red-400"
                    : ""
                }
              >
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Download */}
        {results.length > 0 && !running && (
          <button
            onClick={download}
            className="w-full mt-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-500 active:scale-[0.98] transition"
          >
            Descargar CSV ({results.filter((r) => r.linkedinUrl).length} URLs)
          </button>
        )}
      </div>
    </main>
  );
}
