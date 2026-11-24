import {
  AudioLines,
  BarChart3,
  Cloud,
  Headphones,
  History,
  Info,
  LogOut,
  Moon,
  PenLine,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { filterConversations, getBrainModeConfig } from '../utils/simpliLogic';
import type { VoiceConversation, VoiceOption } from '../types/simpli';

export type WorkspaceView =
  | 'clarify'
  | 'voice'
  | 'writing'
  | 'review'
  | 'insights'
  | 'about';

interface AppSidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  onNewClarify: () => void;
  conversations: VoiceConversation[];
  activeConvId: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  voice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  cloudUser?: { uid: string; displayName: string; email: string } | null;
  isSyncingCloud?: boolean;
  cloudSyncNote?: string | null;
  onSignInCloud?: () => void;
  onSignOutCloud?: () => void;
}

const VOICES: Array<{ id: VoiceOption; label: string }> = [
  { id: 'Kore', label: 'Kore (Clear)' },
  { id: 'Zephyr', label: 'Zephyr (Warm)' },
  { id: 'Puck', label: 'Puck (Crisp)' },
  { id: 'Charon', label: 'Charon (Deep)' },
];

export function AppSidebar({
  isOpen,
  onCloseMobile,
  activeView,
  onSelectView,
  onNewClarify,
  conversations,
  activeConvId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  voice,
  onSelectVoice,
  isDark,
  onToggleTheme,
  cloudUser,
  isSyncingCloud,
  cloudSyncNote,
  onSignInCloud,
  onSignOutCloud,
}: AppSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filteredConversations = useMemo(
    () => filterConversations(conversations, searchQuery),
    [conversations, searchQuery]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onCloseMobile}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs lg:hidden"
      />

      <aside
        aria-label="Simpli navigation and saved conversations"
        className="fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col border-r border-slate-200/80 dark:border-zinc-800 bg-slate-50/95 dark:bg-[#111115] lg:static lg:z-auto"
      >
        {/* Top Brand + New Action */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={() => {
              onSelectView('clarify');
              onCloseMobile();
            }}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
          >
            SIMPLI
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-zinc-800 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              onNewClarify();
              onCloseMobile();
            }}
            className="flex w-full min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-zinc-100 shadow-2xs hover:border-[#7C3AED]/50 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4 text-[#7C3AED] dark:text-[#A78BFA]" aria-hidden="true" />
            <span>New Clarification</span>
          </button>
        </div>

        {/* Primary Workspace Navigation (Main Views) */}
        <nav aria-label="Workspace pages" className="px-3 space-y-1">
          <button
            type="button"
            onClick={() => {
              onSelectView('clarify');
              onCloseMobile();
            }}
            className={`flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'clarify'
                ? 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="h-4 w-4 text-[#7C3AED] dark:text-[#A78BFA]" aria-hidden="true" />
            <span>Clarify Studio</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('voice');
              onCloseMobile();
            }}
            className={`flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'voice'
                ? 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <AudioLines className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span>Voice Tutor</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('writing');
              onCloseMobile();
            }}
            className={`flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'writing'
                ? 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PenLine className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
            <span>Writing Studio</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('review');
              onCloseMobile();
            }}
            className={`flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'review'
                ? 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Headphones className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />
            <span>Review &amp; Quizzes</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView('insights');
              onCloseMobile();
            }}
            className={`flex w-full min-h-[38px] items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              activeView === 'insights'
                ? 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
            <span>Simpli Insights</span>
          </button>
        </nav>

        {/* Saved Learning Conversations History - Generous Spacing for ChatGPT / Gemini Look */}
        <div className="mt-3 flex flex-1 flex-col min-h-0 border-t border-slate-200/80 dark:border-zinc-800 pt-3 px-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Saved Learning ({conversations.length})</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onNewConversation();
                onSelectView('voice');
                onCloseMobile();
              }}
              aria-label="New voice learning session"
              title="New voice learning session"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved sessions..."
              aria-label="Search saved learning conversations"
              className="h-8 w-full rounded-lg border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-2.5 text-xs text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
            {filteredConversations.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-slate-400 dark:text-zinc-500">
                No matching sessions
              </p>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeView === 'voice' && conv.id === activeConvId;
                const mode = getBrainModeConfig(conv.brainMode);
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center justify-between gap-1 rounded-xl px-2.5 py-2 transition-colors ${
                      isActive
                        ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs border border-slate-200/70 dark:border-zinc-700'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectConversation(conv.id);
                        onSelectView('voice');
                        onCloseMobile();
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="truncate text-xs font-medium">{conv.title}</p>
                      <p className="truncate text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {mode.emoji} {conv.turns.length} turns · {conv.topicTag}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteConversation(conv.id)}
                      aria-label={`Delete conversation ${conv.title}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 opacity-70 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Bar: Clean Collapsible Settings Toggle (Pinned at lowest position) */}
        <div className="border-t border-slate-200/80 dark:border-zinc-800 p-3">
          {settingsOpen && (
            <div className="mb-2.5 space-y-2 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="simpli-voice-select"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap"
                >
                  <Volume2 className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
                  <span>Voice Option</span>
                </label>
                <select
                  id="simpli-voice-select"
                  value={voice}
                  onChange={(e) => onSelectVoice(e.target.value as VoiceOption)}
                  className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onToggleTheme}
                className="flex w-full min-h-[34px] items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {isDark ? (
                    <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                  )}
                  <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('about');
                  setSettingsOpen(false);
                  onCloseMobile();
                }}
                className="flex w-full min-h-[34px] items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <Info className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>How it Works</span>
              </button>

              <div className="border-t border-slate-200/80 dark:border-zinc-800 pt-2">
                {cloudUser ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-slate-800 dark:text-zinc-100">
                          {cloudUser.displayName}
                        </p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-zinc-400">
                          {isSyncingCloud ? 'Syncing cloud...' : cloudSyncNote || 'Cloud sync active'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onSignOutCloud}
                        aria-label="Sign out of cloud sync"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:text-rose-600 cursor-pointer shrink-0"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onSignInCloud}
                    className="flex w-full min-h-[34px] items-center justify-between gap-2 rounded-xl bg-slate-100 dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-100 hover:bg-[#7C3AED]/10 hover:text-[#7C3AED] transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Cloud className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
                      <span>Cloud Sync (Optional)</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Later</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-expanded={settingsOpen}
            className="flex w-full min-h-[38px] items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>Settings &amp; Voice</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {settingsOpen ? '▲' : '▼'}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
