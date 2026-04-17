import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  Trash2,
  Check,
  ExternalLink,
  Package,
  Loader2,
  X,
  ChevronDown,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { InstanceService, MinecraftInstance } from '../services/instanceService';
import type {
  ContentFile,
  ContentKind,
  CurseForgeFile,
  CurseForgeMod,
  ModrinthHit,
  ModrinthVersion,
} from '../electron.d';

type Tab = 'browse' | 'installed';
type Source = 'modrinth' | 'curseforge';

interface KindSpec {
  id: ContentKind;
  label: string;
  /** Modrinth `project_type` filter, e.g. `mod`, `shader`, `resourcepack`. */
  projectType: ContentKind;
  icon: React.FC<{ className?: string }>;
  /** Empty state copy when the instance is vanilla (relevant for mods only). */
  vanillaHint?: string;
  /** Override mod-loader facet for this content kind. */
  useLoaderFacet: boolean;
}

const KINDS: KindSpec[] = [
  { id: 'mod', label: 'Mods', projectType: 'mod', icon: Package, vanillaHint: 'Create a Fabric/Forge instance to install mods.', useLoaderFacet: true },
  { id: 'shader', label: 'Shaders', projectType: 'shader', icon: Sparkles, useLoaderFacet: false },
  { id: 'resourcepack', label: 'Resource packs', projectType: 'resourcepack', icon: ImageIcon, useLoaderFacet: false },
];

export const Mods: React.FC = () => {
  const [kind, setKind] = useState<ContentKind>('mod');
  const [tab, setTab] = useState<Tab>('browse');
  const [source, setSource] = useState<Source>('modrinth');
  const [instances, setInstances] = useState<MinecraftInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await InstanceService.getInstances();
      setInstances(list);
      setSelectedId((prev) => prev || list[0]?.id || null);
    })();
  }, []);

  const selected = instances.find((i) => i.id === selectedId);
  const spec = KINDS.find((k) => k.id === kind)!;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-10 pt-10 pb-6 hairline-b surface-0">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="caption mb-2">Content</div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Mods, shaders &amp; resource packs
              </h1>
            </div>
            <InstancePicker
              instances={instances}
              selectedId={selectedId}
              onChange={setSelectedId}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-lg hairline w-fit">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={`h-8 px-3 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${
                      kind === k.id
                        ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                        : 'text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {k.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {tab === 'browse' && (
                <div className="flex items-center gap-1 p-1 rounded-lg hairline w-fit">
                  {(['modrinth', 'curseforge'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSource(s)}
                      className={`h-8 px-3 text-xs font-medium rounded-md transition-colors capitalize ${
                        source === s
                          ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                          : 'text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
                      }`}
                    >
                      {s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 p-1 rounded-lg hairline w-fit">
                {(['browse', 'installed'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`h-8 px-4 text-xs font-medium rounded-md transition-colors ${
                      tab === t
                        ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                        : 'text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
                    }`}
                  >
                    {t === 'browse' ? 'Browse' : 'Installed'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-10 py-8">
          {!selected ? (
            <div className="panel p-10 text-center">
              <Package className="w-8 h-8 mx-auto mb-3 text-ink-500" />
              <div className="text-sm font-medium mb-1">No instance selected</div>
              <div className="text-xs text-ink-500 dark:text-ink-400">
                Create an instance first from the Instances page.
              </div>
            </div>
          ) : tab === 'browse' ? (
            source === 'modrinth' ? (
              <Browse instance={selected} spec={spec} />
            ) : (
              <BrowseCurseForge instance={selected} spec={spec} />
            )
          ) : (
            <Installed instance={selected} spec={spec} />
          )}
        </div>
      </div>
    </div>
  );
};

const InstancePicker: React.FC<{
  instances: MinecraftInstance[];
  selectedId: string | null;
  onChange: (id: string) => void;
}> = ({ instances, selectedId, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = instances.find((i) => i.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg hairline surface-1 hover:surface-2 text-sm transition-colors"
      >
        <Package className="w-4 h-4 text-ink-500" />
        <span className="font-medium">{selected?.name || 'Select instance'}</span>
        {selected && (
          <span className="caption normal-case tracking-normal font-mono">
            {selected.version} · {selected.modLoader}
          </span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 surface-0 hairline rounded-lg shadow-2xl z-30 overflow-hidden">
            <div className="max-h-80 overflow-y-auto py-1">
              {instances.length === 0 ? (
                <div className="px-3 py-4 text-sm text-ink-500">No instances</div>
              ) : (
                instances.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      onChange(i.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:surface-2 transition-colors ${
                      i.id === selectedId ? 'surface-2' : ''
                    }`}
                  >
                    <div className="min-w-0 text-left">
                      <div className="font-medium truncate">{i.name}</div>
                      <div className="caption normal-case tracking-normal font-mono mt-0.5">
                        {i.version} · {i.modLoader}
                      </div>
                    </div>
                    {i.id === selectedId && <Check className="w-4 h-4 ml-2" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const Browse: React.FC<{ instance: MinecraftInstance; spec: KindSpec }> = ({ instance, spec }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModrinthHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ModrinthHit | null>(null);

  const loaders = useMemo(
    () =>
      spec.useLoaderFacet && instance.modLoader && instance.modLoader !== 'vanilla'
        ? [instance.modLoader]
        : [],
    [instance.modLoader, spec.useLoaderFacet]
  );

  const runSearch = async (q: string, initial = false) => {
    if (!window.electronAPI?.modrinth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.modrinth.search({
        query: q,
        loaders,
        gameVersions: [instance.version],
        projectType: spec.projectType,
        limit: 30,
        index: initial && !q ? 'downloads' : 'relevance',
      });
      setResults(res.hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => runSearch(query, query === ''), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, instance.id, spec.id]);

  if (spec.id === 'mod' && instance.modLoader === 'vanilla') {
    return (
      <div className="panel p-8 text-center">
        <Package className="w-6 h-6 mx-auto mb-2 text-ink-500" />
        <div className="text-sm font-medium mb-1">Vanilla instance</div>
        <p className="text-xs text-ink-500 dark:text-ink-400 max-w-md mx-auto">
          {spec.vanillaHint}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search Modrinth for ${spec.label.toLowerCase()}`}
            className="input pl-9"
            autoFocus
          />
        </div>
        <div className="caption">
          {spec.useLoaderFacet ? `${instance.modLoader} · ` : ''}
          {instance.version}
        </div>
      </div>

      {error && <div className="mb-4 panel p-3 text-xs">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center caption">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching Modrinth
        </div>
      ) : results.length === 0 ? (
        <div className="py-10 text-center caption">Nothing found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((hit) => (
            <Card key={hit.project_id} hit={hit} onClick={() => setActive(hit)} />
          ))}
        </div>
      )}

      {active && (
        <DetailModal
          hit={active}
          instance={instance}
          spec={spec}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
};

const Card: React.FC<{ hit: ModrinthHit; onClick: () => void }> = ({ hit, onClick }) => (
  <button
    onClick={onClick}
    className="panel p-4 text-left hover:surface-2 transition-colors flex gap-3"
  >
    <div className="w-12 h-12 rounded-md surface-2 overflow-hidden shrink-0 flex items-center justify-center">
      {hit.icon_url ? (
        <img src={hit.icon_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <Package className="w-5 h-5 text-ink-500" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate mb-0.5">{hit.title}</div>
      <div className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 mb-2">
        {hit.description}
      </div>
      <div className="flex items-center gap-3 caption">
        <span>{formatNumber(hit.downloads)} downloads</span>
        <span className="opacity-40">·</span>
        <span className="truncate">{hit.author}</span>
      </div>
    </div>
  </button>
);

const DetailModal: React.FC<{
  hit: ModrinthHit;
  instance: MinecraftInstance;
  spec: KindSpec;
  onClose: () => void;
}> = ({ hit, instance, spec, onClose }) => {
  const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);

  useEffect(() => {
    if (!window.electronAPI?.modrinth) return;
    const loaders =
      spec.useLoaderFacet && instance.modLoader !== 'vanilla' ? [instance.modLoader] : [];
    window.electronAPI.modrinth
      .getVersions(hit.project_id, {
        loaders,
        gameVersions: [instance.version],
        kind: spec.id,
      })
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hit.project_id, instance.id, instance.modLoader, instance.version, spec]);

  const handleInstall = async (v: ModrinthVersion) => {
    setError(null);
    setInstalling(v.id);
    try {
      await window.electronAPI.modrinth.installVersion({
        instanceId: instance.id,
        versionId: v.id,
        kind: spec.id,
        withDependencies: spec.id === 'mod',
      });
      setInstalled((prev) => [...prev, v.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(null);
    }
  };

  const modrinthUrl = `https://modrinth.com/${spec.id === 'mod' ? 'mod' : spec.id === 'shader' ? 'shader' : 'resourcepack'}/${hit.slug}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-1000/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] panel flex flex-col animate-slide-up overflow-hidden"
      >
        <div className="px-6 py-4 hairline-b flex items-start gap-4">
          <div className="w-12 h-12 rounded-md surface-2 overflow-hidden shrink-0 flex items-center justify-center">
            {hit.icon_url ? (
              <img src={hit.icon_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-5 h-5 text-ink-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold tracking-tight truncate">{hit.title}</div>
            <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2">
              {hit.description}
            </div>
            <div className="flex items-center gap-3 caption mt-2">
              <span>{formatNumber(hit.downloads)} downloads</span>
              <span className="opacity-40">·</span>
              <span>{hit.author}</span>
              <span className="opacity-40">·</span>
              <a
                href={modrinthUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-ink-1000 dark:hover:text-ink-0 flex items-center gap-1"
              >
                Modrinth <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {error && <div className="m-6 text-xs hairline surface-1 rounded-lg px-3 py-2">{error}</div>}
          {!versions ? (
            <div className="flex items-center gap-2 py-10 justify-center caption">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading versions
            </div>
          ) : versions.length === 0 ? (
            <div className="py-10 text-center caption">
              No compatible versions for {instance.version}
            </div>
          ) : (
            <div className="divide-y divide-ink-200 dark:divide-ink-800">
              {versions.slice(0, 30).map((v) => (
                <div key={v.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{v.name}</span>
                      <span className="badge">{v.version_type}</span>
                    </div>
                    <div className="caption normal-case tracking-normal font-mono mt-1 truncate">
                      {v.version_number}
                      {v.loaders.length > 0 && ` · ${v.loaders.join(', ')}`}
                      {' · '}
                      {v.game_versions.join(', ')}
                    </div>
                  </div>
                  {installed.includes(v.id) ? (
                    <div className="flex items-center gap-2 text-xs">
                      <Check className="w-4 h-4" /> Installed
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(v)}
                      disabled={installing !== null}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      {installing === v.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      {installing === v.id ? 'Installing' : 'Install'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Browse: CurseForge ----------

const BrowseCurseForge: React.FC<{ instance: MinecraftInstance; spec: KindSpec }> = ({
  instance,
  spec,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CurseForgeMod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [active, setActive] = useState<CurseForgeMod | null>(null);

  const refreshKey = () => {
    window.electronAPI?.curseforge?.hasKey().then((r) => {
      setHasKey(r.hasKey);
      setKeyPreview(r.preview || null);
    });
  };

  useEffect(() => {
    refreshKey();
  }, []);

  const runSearch = async (q: string) => {
    if (!window.electronAPI?.curseforge || !hasKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.curseforge.search({
        query: q,
        kind: spec.id,
        loader: spec.useLoaderFacet ? instance.modLoader : undefined,
        gameVersion: instance.version,
        pageSize: 30,
      });
      setResults(res.data || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Main process wipes the invalid key on 401/403; re-check so the UI
      // snaps back to the key-entry screen automatically.
      if (/missing or invalid|401|403/i.test(msg)) {
        const r = await window.electronAPI.curseforge.hasKey();
        setHasKey(r.hasKey);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetKey = async () => {
    await window.electronAPI.curseforge.setKey('');
    setHasKey(false);
    setResults([]);
  };

  useEffect(() => {
    if (!hasKey) return;
    const t = setTimeout(() => runSearch(query), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, instance.id, spec.id, hasKey]);

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setKeyError(null);
    setValidating(true);
    try {
      await window.electronAPI.curseforge.setKey(keyInput.trim());
      setKeyInput('');
      refreshKey();
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  };

  if (hasKey === false) {
    return (
      <div className="panel p-6 max-w-xl mx-auto">
        <div className="text-sm font-medium mb-1">CurseForge API key required</div>
        <p className="text-xs text-ink-500 dark:text-ink-400 mb-4 leading-relaxed">
          CurseForge requires a free API key to browse and download. Get one at{' '}
          <a
            href="https://console.curseforge.com/?#/api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink-1000 dark:hover:text-ink-0"
          >
            console.curseforge.com
          </a>{' '}
          (login → API Keys → Generate). Paste it below — it's stored locally.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setKeyError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            placeholder="$2a$10$..."
            className="input font-mono text-xs flex-1"
            disabled={validating}
          />
          <button
            onClick={saveKey}
            disabled={!keyInput.trim() || validating}
            className="btn-primary disabled:opacity-50"
          >
            {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {validating ? 'Verifying' : 'Save'}
          </button>
        </div>
        {keyInput && (
          <div className="caption mt-2 normal-case tracking-normal font-mono">
            Length: {keyInput.trim().length} chars
          </div>
        )}
        {keyError && (
          <div className="text-xs mt-3 hairline surface-1 rounded-lg px-3 py-2 break-words">
            {keyError}
          </div>
        )}
      </div>
    );
  }

  if (spec.id === 'mod' && instance.modLoader === 'vanilla') {
    return (
      <div className="panel p-8 text-center">
        <Package className="w-6 h-6 mx-auto mb-2 text-ink-500" />
        <div className="text-sm font-medium mb-1">Vanilla instance</div>
        <p className="text-xs text-ink-500 dark:text-ink-400 max-w-md mx-auto">
          {spec.vanillaHint}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search CurseForge for ${spec.label.toLowerCase()}`}
            className="input pl-9"
            autoFocus
          />
        </div>
        <div className="caption">
          {spec.useLoaderFacet ? `${instance.modLoader} · ` : ''}
          {instance.version}
        </div>
        <button
          onClick={resetKey}
          className="text-xs h-9 px-3 rounded-lg hairline hover:surface-2 text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 transition-colors flex items-center gap-2"
          title="Reset CurseForge API key"
        >
          {keyPreview && (
            <span className="font-mono opacity-60">{keyPreview}</span>
          )}
          Change key
        </button>
      </div>

      {error && <div className="mb-4 panel p-3 text-xs break-words">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center caption">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching CurseForge
        </div>
      ) : results.length === 0 ? (
        <div className="py-10 text-center caption">Nothing found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((m) => (
            <CFCard key={m.id} mod={m} onClick={() => setActive(m)} />
          ))}
        </div>
      )}

      {active && (
        <CFDetailModal
          mod={active}
          instance={instance}
          spec={spec}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
};

const CFCard: React.FC<{ mod: CurseForgeMod; onClick: () => void }> = ({ mod, onClick }) => (
  <button
    onClick={onClick}
    className="panel p-4 text-left hover:surface-2 transition-colors flex gap-3"
  >
    <div className="w-12 h-12 rounded-md surface-2 overflow-hidden shrink-0 flex items-center justify-center">
      {mod.logo?.url ? (
        <img src={mod.logo.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <Package className="w-5 h-5 text-ink-500" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate mb-0.5">{mod.name}</div>
      <div className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 mb-2">{mod.summary}</div>
      <div className="flex items-center gap-3 caption">
        <span>{formatNumber(mod.downloadCount)} downloads</span>
        <span className="opacity-40">·</span>
        <span className="truncate">
          {mod.authors.map((a) => a.name).slice(0, 2).join(', ')}
        </span>
      </div>
    </div>
  </button>
);

const CFDetailModal: React.FC<{
  mod: CurseForgeMod;
  instance: MinecraftInstance;
  spec: KindSpec;
  onClose: () => void;
}> = ({ mod, instance, spec, onClose }) => {
  const [files, setFiles] = useState<CurseForgeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<number | null>(null);
  const [installed, setInstalled] = useState<number[]>([]);

  useEffect(() => {
    if (!window.electronAPI?.curseforge) return;
    window.electronAPI.curseforge
      .getFiles({
        modId: mod.id,
        loader: spec.useLoaderFacet ? instance.modLoader : undefined,
        gameVersion: instance.version,
        kind: spec.id,
      })
      .then((r) => setFiles(r.data || []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [mod.id, instance.id, instance.modLoader, instance.version, spec]);

  const handleInstall = async (f: CurseForgeFile) => {
    setError(null);
    setInstalling(f.id);
    try {
      await window.electronAPI.curseforge.installFile({
        instanceId: instance.id,
        modId: mod.id,
        fileId: f.id,
        kind: spec.id,
      });
      setInstalled((prev) => [...prev, f.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(null);
    }
  };

  const releaseLabel = (r: number) => (r === 1 ? 'release' : r === 2 ? 'beta' : 'alpha');

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-1000/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] panel flex flex-col animate-slide-up overflow-hidden"
      >
        <div className="px-6 py-4 hairline-b flex items-start gap-4">
          <div className="w-12 h-12 rounded-md surface-2 overflow-hidden shrink-0 flex items-center justify-center">
            {mod.logo?.url ? (
              <img src={mod.logo.url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-5 h-5 text-ink-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold tracking-tight truncate">{mod.name}</div>
            <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2">
              {mod.summary}
            </div>
            <div className="flex items-center gap-3 caption mt-2">
              <span>{formatNumber(mod.downloadCount)} downloads</span>
              <span className="opacity-40">·</span>
              <span>{mod.authors.map((a) => a.name).slice(0, 2).join(', ')}</span>
              {mod.links?.websiteUrl && (
                <>
                  <span className="opacity-40">·</span>
                  <a
                    href={mod.links.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-1000 dark:hover:text-ink-0 flex items-center gap-1"
                  >
                    CurseForge <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {error && <div className="m-6 text-xs hairline surface-1 rounded-lg px-3 py-2 break-words">{error}</div>}
          {!files ? (
            <div className="flex items-center gap-2 py-10 justify-center caption">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading files
            </div>
          ) : files.length === 0 ? (
            <div className="py-10 text-center caption">
              No compatible files for {instance.version}
            </div>
          ) : (
            <div className="divide-y divide-ink-200 dark:divide-ink-800">
              {files.slice(0, 30).map((f) => (
                <div key={f.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{f.displayName}</span>
                      <span className="badge">{releaseLabel(f.releaseType)}</span>
                    </div>
                    <div className="caption normal-case tracking-normal font-mono mt-1 truncate">
                      {f.fileName} · {f.gameVersions.join(', ')}
                    </div>
                  </div>
                  {installed.includes(f.id) ? (
                    <div className="flex items-center gap-2 text-xs">
                      <Check className="w-4 h-4" /> Installed
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(f)}
                      disabled={installing !== null}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      {installing === f.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      {installing === f.id ? 'Installing' : 'Install'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Installed: React.FC<{ instance: MinecraftInstance; spec: KindSpec }> = ({ instance, spec }) => {
  const [files, setFiles] = useState<ContentFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!window.electronAPI?.content) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await window.electronAPI.content.list(instance.id, spec.id);
    setFiles(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id, spec.id]);

  const toggle = async (rawFilename: string) => {
    await window.electronAPI.content.toggle(instance.id, rawFilename, spec.id);
    await load();
  };

  const del = async (rawFilename: string) => {
    if (!confirm(`Delete ${rawFilename}?`)) return;
    await window.electronAPI.content.delete(instance.id, rawFilename, spec.id);
    await load();
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 py-10 justify-center caption">
        <Loader2 className="w-4 h-4 animate-spin" />
        Reading folder
      </div>
    );

  if (files.length === 0)
    return (
      <div className="panel p-10 text-center">
        <Package className="w-6 h-6 mx-auto mb-2 text-ink-500" />
        <div className="text-sm font-medium mb-1">Nothing installed</div>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Switch to Browse Modrinth to install {spec.label.toLowerCase()} into this instance.
        </p>
      </div>
    );

  return (
    <div className="panel divide-y divide-ink-200 dark:divide-ink-800">
      {files.map((m) => (
        <div key={m.rawFilename} className="flex items-center gap-4 px-4 py-3">
          <div
            className={`w-1.5 h-1.5 rounded-full bg-ink-1000 dark:bg-ink-0 ${
              m.enabled ? '' : 'opacity-20'
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.filename}</div>
            <div className="caption normal-case tracking-normal font-mono mt-0.5">
              {formatBytes(m.size)}
            </div>
          </div>
          <button
            onClick={() => toggle(m.rawFilename)}
            className={`text-xs font-medium w-20 h-7 rounded-md transition-colors ${
              m.enabled
                ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                : 'hairline text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
            }`}
          >
            {m.enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            onClick={() => del(m.rawFilename)}
            className="w-8 h-7 rounded-md text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 hover:surface-2 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatBytes(b: number): string {
  if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b > 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}
