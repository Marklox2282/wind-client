import React, { useEffect, useState } from 'react';
import { Plus, Play, Copy, Trash2, X, AlertCircle, Settings, Sparkles, Loader2, Check } from 'lucide-react';
import { InstanceService, MinecraftInstance } from '../services/instanceService';
import { MinecraftLauncherService } from '../services/minecraftLauncherService';

export const Instances: React.FC = () => {
  const [instances, setInstances] = useState<MinecraftInstance[]>([]);
  const [versions, setVersions] = useState<Array<{ id: string; type: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MinecraftInstance | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [ins, vs] = await Promise.all([
      InstanceService.getInstances(),
      MinecraftLauncherService.getAvailableVersions(),
    ]);
    setInstances(ins);
    setVersions(vs);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const formatLast = (d?: string) => {
    if (!d) return 'never';
    const ms = Date.now() - new Date(d).getTime();
    const h = Math.floor(ms / 3600000);
    const dd = Math.floor(h / 24);
    if (dd > 0) return `${dd}d ago`;
    if (h > 0) return `${h}h ago`;
    return 'just now';
  };

  const handleLaunch = async (id: string) => {
    setLaunchingId(id);
    setError(null);
    try {
      await InstanceService.launchInstance(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunchingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this instance?')) return;
    await InstanceService.deleteInstance(id);
    await load();
  };

  const handleDuplicate = async (id: string) => {
    const name = prompt('Name for the duplicated instance:');
    if (!name) return;
    await InstanceService.duplicateInstance(id, name);
    await load();
  };

  return (
    <div className="h-full p-10 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="caption mb-2">Instances</div>
            <h1 className="text-2xl font-semibold tracking-tight">Minecraft installations</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New instance
          </button>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 panel p-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-ink-1000 dark:text-ink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium mb-0.5">Launch failed</div>
              <div className="text-xs text-ink-500 dark:text-ink-400 break-all">{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="caption">Loading…</div>
        ) : instances.length === 0 ? (
          <div className="panel py-16 flex flex-col items-center justify-center text-center">
            <div className="text-sm font-medium mb-1">No instances yet</div>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">
              Create an instance to manage different setups with their own mods.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Create instance
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {instances.map((i) => (
              <div key={i.id} className="panel p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="caption normal-case tracking-normal font-mono mt-1">
                      {i.version} · {i.modLoader}
                      {i.modLoaderVersion ? ` ${i.modLoaderVersion}` : ''}
                    </div>
                  </div>
                  <span className="badge">{i.mods.length} mods</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="caption">Last played {formatLast(i.lastPlayed)}</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(i)}
                      className="w-7 h-7 rounded-md text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 hover:surface-2 flex items-center justify-center"
                      title="Edit"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(i.id)}
                      className="w-7 h-7 rounded-md text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 hover:surface-2 flex items-center justify-center"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(i.id)}
                      className="w-7 h-7 rounded-md text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 hover:surface-2 flex items-center justify-center"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleLaunch(i.id)}
                      disabled={launchingId === i.id}
                      className="btn-primary h-7 px-3 text-xs"
                    >
                      <Play className="w-3 h-3" fill="currentColor" />
                      {launchingId === i.id ? 'Starting' : 'Play'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          versions={versions}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {editing && (
        <EditModal
          instance={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};

// ---------- Edit Modal ----------

const EditModal: React.FC<{
  instance: MinecraftInstance;
  onClose: () => void;
  onSaved: () => void;
}> = ({ instance, onClose, onSaved }) => {
  const [name, setName] = useState(instance.name);
  const [minMem, setMinMem] = useState(instance.minMemory ?? 1024);
  const [maxMem, setMaxMem] = useState(instance.maxMemory ?? 4096);
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '');
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? '');
  const [envVars, setEnvVars] = useState(instance.envVars ?? '');
  const [saving, setSaving] = useState(false);
  const [installingPack, setInstallingPack] = useState(false);
  const [packResult, setPackResult] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);

  const installPack = async () => {
    setPackError(null);
    setPackResult(null);
    setInstallingPack(true);
    try {
      const res = await window.electronAPI.presets.installRecommended(instance.id);
      setPackResult(
        `Installed ${res.installed.length} items` +
          (res.skipped.length ? ` · skipped ${res.skipped.length}` : '') +
          (res.shader ? ` · shader "${res.shader}" enabled` : '')
      );
    } catch (e) {
      setPackError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallingPack(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await InstanceService.updateInstance(instance.id, {
        name: name.trim() || instance.name,
        minMemory: minMem,
        maxMemory: maxMem,
        javaPath: javaPath.trim() || undefined,
        jvmArgs: jvmArgs.trim() || undefined,
        envVars: envVars.trim() || undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-1000/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] panel flex flex-col animate-slide-up overflow-hidden"
      >
        <div className="px-6 py-4 hairline-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Edit instance</h2>
            <div className="caption mt-1 normal-case tracking-normal font-mono">
              {instance.version} · {instance.modLoader}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-auto px-6 py-5 space-y-6">
          <section>
            <div className="caption mb-2">Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </section>

          <section>
            <div className="caption mb-3">Memory</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-500 dark:text-ink-400 mb-1 block">
                  Minimum (MB)
                </label>
                <input
                  type="number"
                  min={256}
                  step={256}
                  value={minMem}
                  onChange={(e) => setMinMem(Number(e.target.value))}
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-ink-500 dark:text-ink-400 mb-1 block">
                  Maximum (MB)
                </label>
                <input
                  type="number"
                  min={512}
                  step={512}
                  value={maxMem}
                  onChange={(e) => setMaxMem(Number(e.target.value))}
                  className="input font-mono"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="caption mb-2">Java</div>
            <label className="text-xs text-ink-500 dark:text-ink-400 mb-1 block">
              Custom executable path (leave empty for auto-detect)
            </label>
            <input
              value={javaPath}
              onChange={(e) => setJavaPath(e.target.value)}
              placeholder="C:\Program Files\Java\jdk-21\bin\javaw.exe"
              className="input font-mono text-xs"
            />
          </section>

          <section>
            <div className="caption mb-2">Custom JVM arguments</div>
            <label className="text-xs text-ink-500 dark:text-ink-400 mb-1 block">
              Appended after the profile's args. Use quotes for values with spaces.
            </label>
            <textarea
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="-XX:+UseG1GC -XX:+UseStringDeduplication"
              rows={3}
              className="input font-mono text-xs py-2 resize-none min-h-20"
            />
          </section>

          {instance.modLoader === 'fabric' && (
            <section>
              <div className="caption mb-2">Recommended pack</div>
              <div className="panel p-4">
                <div className="text-xs text-ink-500 dark:text-ink-400 mb-3 leading-relaxed">
                  Sodium · Iris · Sodium Extra · Reese's Options · Mod Menu · Complementary
                  shaders. In-game mod menu with black/custom cloud toggles, ready on launch.
                </div>
                <button
                  type="button"
                  onClick={installPack}
                  disabled={installingPack}
                  className="btn-secondary h-8 text-xs disabled:opacity-50"
                >
                  {installingPack ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {installingPack ? 'Installing…' : 'Install / update pack'}
                </button>
                {packResult && (
                  <div className="caption mt-3 flex items-center gap-2">
                    <Check className="w-3 h-3" /> {packResult}
                  </div>
                )}
                {packError && (
                  <div className="text-xs mt-3 break-words text-ink-1000 dark:text-ink-0">
                    {packError}
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="caption mb-2">Environment variables</div>
            <label className="text-xs text-ink-500 dark:text-ink-400 mb-1 block">
              One per line, <span className="font-mono">KEY=VALUE</span>. Lines starting with{' '}
              <span className="font-mono">#</span> are ignored.
            </label>
            <textarea
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              placeholder={"JAVA_TOOL_OPTIONS=-Xlog:disable\n# _JAVA_OPTIONS="}
              rows={4}
              className="input font-mono text-xs py-2 resize-none min-h-24"
            />
          </section>
        </form>

        <div className="px-6 py-4 hairline-t flex items-center justify-end gap-2">
          <button onClick={onClose} type="button" className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={save as any}
            disabled={saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateModal: React.FC<{
  versions: Array<{ id: string; type: string }>;
  onClose: () => void;
  onCreated: () => void;
}> = ({ versions, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.20.1');
  const [loader, setLoader] = useState<'vanilla' | 'fabric' | 'forge' | 'quilt'>('vanilla');
  const [installPack, setInstallPack] = useState(true);
  const [creating, setCreating] = useState(false);
  const [packStatus, setPackStatus] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setPackError(null);
    try {
      const created = await InstanceService.createInstance({
        name: name.trim(),
        version,
        modLoader: loader,
      });
      if (loader === 'fabric' && installPack && window.electronAPI?.presets) {
        setPackStatus('Downloading recommended pack from Modrinth…');
        try {
          const res = await window.electronAPI.presets.installRecommended(created.id);
          setPackStatus(
            `Installed ${res.installed.length} items` +
              (res.skipped.length ? ` (${res.skipped.length} skipped)` : '')
          );
        } catch (e) {
          setPackError(e instanceof Error ? e.message : String(e));
          // Don't abort instance creation on pack failure.
        }
      }
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-1000/60 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md panel p-6 animate-slide-up"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold">New instance</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="caption block mb-2">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My instance"
              className="input"
              autoFocus
            />
          </div>
          <div>
            <label className="caption block mb-2">Version</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="input"
            >
              {versions.filter((v) => v.type === 'release').slice(0, 50).map((v) => (
                <option key={v.id} value={v.id} className="bg-ink-0 dark:bg-ink-900">
                  {v.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="caption block mb-2">Mod loader</label>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg hairline">
              {(['vanilla', 'fabric', 'forge', 'quilt'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLoader(t)}
                  className={`h-7 text-xs font-medium rounded-md transition-colors capitalize ${
                    loader === t
                      ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                      : 'text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {loader === 'fabric' && (
            <label className="flex items-start gap-3 panel p-3 cursor-pointer hover:surface-2 transition-colors">
              <input
                type="checkbox"
                checked={installPack}
                onChange={(e) => setInstallPack(e.target.checked)}
                className="mt-0.5 accent-ink-1000 dark:accent-ink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Install recommended pack
                </div>
                <div className="caption normal-case tracking-normal mt-1 leading-snug">
                  Sodium · Iris Shaders · Sodium Extra · Reese's Options · Mod Menu ·
                  Complementary shaders. In-game mod menu + black/custom clouds out of the box.
                </div>
              </div>
            </label>
          )}

          {packStatus && (
            <div className="caption flex items-center gap-2">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {packStatus}
            </div>
          )}
          {packError && (
            <div className="text-xs hairline surface-1 rounded-lg px-3 py-2 break-words">
              Pack install failed: {packError}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={creating || !name.trim()} className="btn-primary flex-1 disabled:opacity-50">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
