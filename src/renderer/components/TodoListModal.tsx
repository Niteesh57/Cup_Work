import React, { useState, useMemo } from 'react';
import { CheckCircle2, Circle, Clock, Plus, X, ListTodo, Trash2 } from 'lucide-react';

export interface TodoTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed' | 'in_progress' | 'cancelled';
  priority?: 'high' | 'medium' | 'low' | string;
  due_date?: number;
  tags?: string[];
  created_at?: string | number;
  updated_at?: string | number;
}

export interface TodoCounts {
  total: number;
  pending: number;
  done: number;
}

interface TodoListModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TodoTask[];
  counts: TodoCounts;
  onToggleTask: (taskId: string, currentStatus: string) => Promise<void>;
  onAddTask?: (title: string, priority: string) => Promise<void>;
  onClearAll?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export function TodoListModal({
  isOpen,
  onClose,
  tasks = [],
  counts,
  onToggleTask,
  onAddTask,
  onClearAll,
  onRefresh,
}: TodoListModalProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [isAdding, setIsAdding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const effectiveCounts = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    const pending = list.filter((t) => t.status !== 'completed').length;
    const done = list.filter((t) => t.status === 'completed').length;
    return {
      total: list.length,
      pending,
      done,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    return list.filter((t) => {
      if (filter === 'active') return t.status !== 'completed';
      if (filter === 'done') return t.status === 'completed';
      return true;
    });
  }, [tasks, filter]);

  if (!isOpen) return null;

  const handleToggle = async (taskId: string, currentStatus: string) => {
    setTogglingId(taskId);
    try {
      await onToggleTask(taskId, currentStatus);
    } finally {
      setTogglingId(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || isAdding || !onAddTask) return;

    setIsAdding(true);
    try {
      await onAddTask(trimmed, newPriority);
      setNewTitle('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleClearAll = async () => {
    if (!onClearAll || isClearing) return;
    setIsClearing(true);
    try {
      await onClearAll();
    } finally {
      setIsClearing(false);
    }
  };

  const percentDone = effectiveCounts.total > 0 ? Math.round((effectiveCounts.done / effectiveCounts.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden z-10 flex flex-col max-h-[85vh] animate-scaleUp"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <ListTodo size={17} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 leading-tight">Today's Tasks & Todo List</h2>
              <p className="text-[11px] text-zinc-500 font-medium">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onClearAll && effectiveCounts.total > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isClearing}
                className="btn btn-ghost btn-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 gap-1 rounded-lg text-[10px] font-semibold mr-1"
                title="Delete all tasks for today"
              >
                <Trash2 size={12} />
                <span>Clear All</span>
              </button>
            )}
            {onRefresh && (
              <button
                onClick={() => onRefresh()}
                className="btn btn-ghost btn-circle btn-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200"
                title="Refresh tasks"
                aria-label="Refresh tasks"
              >
                <Clock size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="btn btn-ghost btn-circle btn-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200"
              aria-label="Close Tasks Modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Progress & Summary Bar */}
        <div className="px-6 py-3 bg-white border-b border-zinc-100 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="badge badge-sm bg-zinc-900 text-white border-0 font-mono">
                {effectiveCounts.pending} left
              </span>
              <span className="badge badge-sm bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                {effectiveCounts.done} done
              </span>
            </div>
            <span className="text-[11px] font-bold text-zinc-500">
              {percentDone}% Completed
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentDone}%` }}
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between pt-1">
            <div className="join join-horizontal bg-zinc-100 p-0.5 rounded-xl text-[11px] font-semibold">
              <button
                onClick={() => setFilter('all')}
                className={`join-item px-3 py-1 rounded-lg transition-all ${
                  filter === 'all' ? 'bg-white text-zinc-900 shadow-2xs font-bold' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                All ({effectiveCounts.total})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`join-item px-3 py-1 rounded-lg transition-all ${
                  filter === 'active' ? 'bg-white text-zinc-900 shadow-2xs font-bold' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Active ({effectiveCounts.pending})
              </button>
              <button
                onClick={() => setFilter('done')}
                className={`join-item px-3 py-1 rounded-lg transition-all ${
                  filter === 'done' ? 'bg-white text-zinc-900 shadow-2xs font-bold' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Done ({effectiveCounts.done})
              </button>
            </div>

            <span className="text-[10px] text-zinc-400 italic">
              Managed by AI agent & user
            </span>
          </div>
        </div>

        {/* Task Cards List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 min-h-[160px] max-h-[360px]">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-400 space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-zinc-50 flex items-center justify-center border border-zinc-200">
                <CheckCircle2 size={20} className="text-zinc-300" />
              </div>
              <p className="text-xs font-semibold text-zinc-600">
                {filter === 'done'
                  ? 'No completed tasks yet.'
                  : filter === 'active'
                  ? 'All tasks completed for today! 🎉'
                  : 'No tasks on your list today.'}
              </p>
              <p className="text-[11px] text-zinc-400 max-w-xs">
                Ask your AI companion: "Add review PR to my tasks for today" or add one below.
              </p>
            </div>
          ) : (
            filteredTasks.map((t) => {
              const isDone = t.status === 'completed';
              const isToggling = togglingId === t.id;

              return (
                <div
                  key={t.id}
                  onClick={() => !isToggling && handleToggle(t.id, t.status)}
                  className={`group flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isDone
                      ? 'bg-zinc-50/70 border-zinc-200 opacity-60'
                      : 'bg-white border-zinc-200/90 hover:border-zinc-300 hover:shadow-xs'
                  }`}
                >
                  <button
                    type="button"
                    disabled={isToggling}
                    className={`shrink-0 mt-0.5 transition-transform active:scale-90 ${
                      isDone ? 'text-emerald-600' : 'text-zinc-300 hover:text-zinc-500'
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-bold leading-tight truncate ${
                          isDone ? 'line-through text-zinc-400' : 'text-zinc-900'
                        }`}
                      >
                        {t.title}
                      </span>

                      {t.priority && (
                        <span
                          className={`badge badge-xs text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                            t.priority === 'high'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : t.priority === 'medium'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                          }`}
                        >
                          {t.priority}
                        </span>
                      )}
                    </div>

                    {t.description && (
                      <p
                        className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${
                          isDone ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                      >
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Add Task Input Form */}
        {onAddTask && (
          <form
            onSubmit={handleAdd}
            className="p-4 bg-zinc-50/90 border-t border-zinc-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a new task for today…"
              className="flex-1 px-3.5 py-2 bg-white text-xs font-semibold text-zinc-900 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400"
            />

            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as 'high' | 'medium' | 'low')}
              className="select select-sm select-bordered rounded-xl text-xs font-semibold bg-white border-zinc-300 text-zinc-700 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <button
              type="submit"
              disabled={!newTitle.trim() || isAdding}
              className="btn btn-sm bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl px-3.5 border-none shadow-xs gap-1 disabled:opacity-40"
            >
              <Plus size={13} />
              <span>Add</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
