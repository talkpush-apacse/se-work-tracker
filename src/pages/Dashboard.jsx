import { useState, useRef } from 'react';
import { Trophy, Zap, Clock, Flame, Activity, TrendingUp, Star, Plus, Timer } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import { getThisWeekRange, filterPointsByRange, formatRelative, formatDateTime, getStreakDays } from '../utils/dateHelpers';
import AddPointsModal from '../components/AddPointsModal';
import ConfirmDialog from '../components/ConfirmDialog';

function CustomerBadge({ customerId, customers, size = 'sm' }) {
  const c = customers.find(x => x.id === customerId);
  if (!c) return null;
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sz}`}
      style={{ backgroundColor: (c.color || '#6366f1') + '22', color: c.color || '#6366f1', border: `1px solid ${c.color || '#6366f1'}40` }}
    >
      {c.name}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'text-indigo-400 bg-indigo-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${colors[color]}`}>
        <Icon size={18} className={colors[color].split(' ')[0]} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const { projects, customers, okrs, points } = useAppStore();
  const { isRunning, projectId: runningProjectId, startTimer, stopTimer } = useTimerContext();
  const [addModal, setAddModal] = useState(null);
  const [timerConflict, setTimerConflict] = useState(null); // holds the project to start after conflict
  const [flashId, setFlashId] = useState(null);
  const flashRef = useRef({});

  const { start, end } = getThisWeekRange();
  const weekPoints = filterPointsByRange(points, start, end);
  const totalPts = weekPoints.reduce((s, p) => s + p.points, 0);
  const totalHrs = weekPoints.reduce((s, p) => s + p.hours, 0);

  // Most active project this week
  const projectWeekPoints = {};
  weekPoints.forEach(p => { projectWeekPoints[p.projectId] = (projectWeekPoints[p.projectId] || 0) + p.points; });
  const topProjectId = Object.entries(projectWeekPoints).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topProject = projects.find(p => p.id === topProjectId);

  // Most common activity this week
  const actCounts = {};
  weekPoints.forEach(p => { const key = p.activityType || 'General'; actCounts[key] = (actCounts[key] || 0) + p.points; });
  const topActivity = Object.entries(actCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const streak = getStreakDays(points);
  const activeProjects = projects.filter(p => p.status === 'Active');

  // Leaderboard: active projects sorted by total points
  const leaderboard = activeProjects.map(project => {
    const entries = points.filter(pt => pt.projectId === project.id);
    const totalPoints = entries.reduce((s, e) => s + e.points, 0);
    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const lastActivity = entries.length ? entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp : null;
    return { ...project, totalPoints, totalHours, lastActivity };
  }).sort((a, b) => b.totalPoints - a.totalPoints);

  const maxPoints = leaderboard[0]?.totalPoints || 1;

  // OKR health
  const okrHealth = okrs.map(okr => {
    const okrProjects = projects.filter(p => p.okrId === okr.id);
    const okrPoints = okrProjects.reduce((s, proj) => {
      return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.points, 0);
    }, 0);
    const okrHours = okrProjects.reduce((s, proj) => {
      return s + points.filter(pt => pt.projectId === proj.id).reduce((ss, e) => ss + e.hours, 0);
    }, 0);
    return { ...okr, projectCount: okrProjects.length, totalPoints: okrPoints, totalHours: okrHours };
  }).sort((a, b) => b.totalPoints - a.totalPoints);

  // Recent activity feed
  const recentActivity = [...points]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 15)
    .map(entry => {
      const project = projects.find(p => p.id === entry.projectId);
      return { ...entry, project };
    });

  const handlePointSuccess = (entry) => {
    setFlashId(entry.projectId);
    setTimeout(() => setFlashId(null), 1000);
  };

  const rankIcon = (i) => {
    if (i === 0) return <Trophy size={16} className="text-yellow-400" />;
    if (i === 1) return <span className="text-gray-400 font-bold text-sm">2</span>;
    if (i === 2) return <span className="text-orange-400 font-bold text-sm">3</span>;
    return <span className="text-gray-600 text-sm font-medium">{i + 1}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            This week: <span className={totalPts > 0 ? 'text-indigo-400 font-semibold' : 'text-gray-400'}>{totalPts} pts</span> across <span className={weekPoints.length > 0 ? 'text-indigo-400 font-semibold' : 'text-gray-400'}>{weekPoints.length}</span> entries
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2">
            <Flame size={16} className="text-orange-400" />
            <span className="text-sm font-bold text-orange-300">{streak} day streak</span>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Zap} label="Points this week" value={totalPts} color="indigo" />
        <StatCard icon={Clock} label="Hours this week" value={totalHrs.toFixed(1)} color="violet" />
        <StatCard icon={Star} label="Top project" value={topProject?.name || 'None yet'} sub="this week" color="amber" />
        <StatCard icon={Activity} label="Top activity" value={topActivity ? topActivity.split(' ')[0] : 'None yet'} sub="by points" color="emerald" />
        <StatCard icon={TrendingUp} label="Active projects" value={activeProjects.length} color="rose" />
      </div>

      {/* Weekly summary banner */}
      {totalPts > 0 && (
        <div className="bg-gradient-to-r from-indigo-900/50 to-violet-900/30 border border-indigo-700/40 rounded-2xl p-4">
          <p className="text-sm text-indigo-200">
            <span className="font-bold text-white">Weekly Summary:</span> You've invested{' '}
            <span className="text-yellow-400 font-bold">{totalPts} points</span> and{' '}
            <span className="text-emerald-400 font-bold">{totalHrs.toFixed(1)}h</span> across{' '}
            {new Set(weekPoints.map(p => p.projectId)).size} projects.
            {topProject && <> Top focus: <span className="text-indigo-300 font-semibold">{topProject.name}</span>.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-white flex items-center gap-2"><Trophy size={16} className="text-yellow-400" /> Project Leaderboard</h2>
            <span className="text-xs text-gray-500">Active projects</span>
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-gray-500 text-sm">No active projects yet.</p>
              <button onClick={() => onNavigate('projects')} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Create your first project →</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {leaderboard.map((project, i) => {
                const customer = customers.find(c => c.id === project.customerId);
                const okr = okrs.find(o => o.id === project.okrId);
                const pct = maxPoints > 0 ? (project.totalPoints / maxPoints) * 100 : 0;
                const isFlashing = flashId === project.id;

                return (
                  <div
                    key={project.id}
                    className={`px-5 py-3.5 hover:bg-gray-800/50 transition-colors cursor-pointer ${i === 0 ? 'bg-yellow-500/5' : ''}`}
                    onClick={() => onNavigate('projects', project.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 flex items-center justify-center flex-shrink-0">{rankIcon(i)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold text-sm ${i === 0 ? 'text-yellow-100' : 'text-white'}`}>{project.name}</span>
                          {customer && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ backgroundColor: (customer.color || '#6366f1') + '22', color: customer.color || '#6366f1', border: `1px solid ${customer.color || '#6366f1'}40` }}
                            >
                              {customer.name}
                            </span>
                          )}
                        </div>
                        {okr && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{okr.title}</p>}
                        <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: customer?.color || '#6366f1' }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="relative">
                          <p className={`font-bold text-sm ${i === 0 ? 'text-yellow-400' : 'text-white'}`}>{project.totalPoints} pts</p>
                          {isFlashing && (
                            <span className="point-flash absolute -top-1 right-0 text-xs font-bold text-yellow-400 whitespace-nowrap">+pts!</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500">{project.totalHours.toFixed(1)}h</p>
                      </div>
                      {/* Timer button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isRunning && runningProjectId !== project.id) {
                            setTimerConflict(project);
                          } else if (!isRunning) {
                            startTimer(project.id);
                          }
                          // If already running for THIS project, widget is visible — no action needed
                        }}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          runningProjectId === project.id
                            ? 'bg-emerald-600/30 text-emerald-400 cursor-default'
                            : 'bg-gray-700/50 hover:bg-emerald-600/20 text-gray-400 hover:text-emerald-400'
                        }`}
                        title={runningProjectId === project.id ? 'Timer running' : 'Start timer'}
                      >
                        <Timer size={13} />
                      </button>
                      {/* Add points button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddModal(project); }}
                        className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 transition-colors flex-shrink-0"
                        title="Add points"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold text-white flex items-center gap-2"><Activity size={16} className="text-indigo-400" /> Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Activity size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500 mb-1">No activity yet</p>
              <p className="text-xs text-gray-600 mb-4">Log points on your projects to see your work history here.</p>
              <button
                onClick={() => onNavigate('projects')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Log your first points →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60 max-h-96 overflow-y-auto scrollbar-thin">
              {recentActivity.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.project?.name || 'Unknown'}</p>
                      <p className="text-[11px] text-gray-500">{entry.activityType || 'General'}</p>
                      {entry.comment && <p className="text-[11px] text-gray-600 mt-0.5 truncate">{entry.comment}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-indigo-400">+{entry.points}</span>
                      <p className="text-[10px] text-gray-600">{formatRelative(entry.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* OKR Health */}
      {okrHealth.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">OKR Investment Health</h2>
            <span className="text-xs text-gray-500">Are you working on the right things?</span>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {okrHealth.map((okr, i) => {
              const maxOkrPts = okrHealth[0]?.totalPoints || 1;
              const pct = maxOkrPts > 0 ? (okr.totalPoints / maxOkrPts) * 100 : 0;
              return (
                <button
                  key={okr.id}
                  onClick={() => onNavigate('okrs')}
                  className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 text-left w-full cursor-pointer hover:border-indigo-500/50 hover:bg-gray-800/80 transition-all"
                >
                  <p className="text-sm font-semibold text-white leading-snug mb-3 line-clamp-2">{okr.title}</p>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{okr.projectCount} project{okr.projectCount !== 1 ? 's' : ''}</span>
                    <span className="text-white font-bold">{okr.totalPoints} pts · {okr.totalHours.toFixed(1)}h</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {addModal && (
        <AddPointsModal
          project={addModal}
          onClose={() => setAddModal(null)}
          onSuccess={handlePointSuccess}
        />
      )}

      {timerConflict && (
        <ConfirmDialog
          title="Timer Already Running"
          message={`A timer is already running for another project. Stop it first (you'll be prompted to save), then start a new timer for "${timerConflict.name}".`}
          danger={false}
          onConfirm={() => { stopTimer(); setTimerConflict(null); }}
          onCancel={() => setTimerConflict(null)}
        />
      )}
    </div>
  );
}
