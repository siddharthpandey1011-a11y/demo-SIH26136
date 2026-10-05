/**
 * ActiveProblemStatements.tsx — Live challenges & RFP feed from the database
 *
 * Fetches published challenges from GET /challenges/public (no auth).
 * Maps real Challenge fields to the card UI.
 * Filters: Sector, Status, DPIIT Required.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  Filter,
  Clock,
  IndianRupee,
  Tag,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Challenge {
  id: number;
  title: string;
  description: string;
  budget_band: string;
  required_sector: string;
  dpiit_required: boolean;
  status: string;         // 'published' | 'draft' | 'closed'
  deadline: string | null;
  created_at: string | null;
}

// Map backend status → display label
function stageLabel(status: string): string {
  if (status === 'published') return 'Open for Bids';
  if (status === 'closed') return 'Closed';
  return 'Under Review';
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const now = new Date();
  const target = new Date(isoDate);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days === null) {
    return <span className="aps-deadline">No Deadline Set</span>;
  }
  if (days < 0) {
    return (
      <span className="aps-deadline aps-deadline--expired">
        <AlertCircle size={12} /> Closed
      </span>
    );
  }
  const urgent = days <= 7;
  return (
    <span className={`aps-deadline ${urgent ? 'aps-deadline--urgent' : ''}`}>
      <Clock size={12} />
      {urgent ? `${days}d left!` : `${days} days left`}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface ActiveProblemStatementsProps {
  onApply?: () => void;
}

export const ActiveProblemStatements: React.FC<ActiveProblemStatementsProps> = ({ onApply }) => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sector, setSector] = useState('All');
  const [dpiitFilter, setDpiitFilter] = useState<'All' | 'Required' | 'Not Required'>('All');

  // ── Fetch published challenges (public, no auth) ──────────────────────────
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || '';
    
    const fetchChallenges = () => {
      fetch(`${API_BASE}/challenges/public`)
        .then((res) => {
          if (!res.ok) throw new Error(`Server error: ${res.status}`);
          return res.json();
        })
        .then((data: Challenge[]) => {
          setChallenges(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load challenges');
          setLoading(false);
        });
    };

    // Initial fetch
    fetchChallenges();

    // Auto-synchronize every 10 seconds
    const intervalId = setInterval(fetchChallenges, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // ── Derived filter options from real data ─────────────────────────────────
  const allSectors = useMemo(
    () => ['All', ...Array.from(new Set(challenges.map((c) => c.required_sector)))],
    [challenges]
  );

  const filtered = useMemo(() => {
    return challenges.filter((c) => {
      if (sector !== 'All' && c.required_sector !== sector) return false;
      if (dpiitFilter === 'Required' && !c.dpiit_required) return false;
      if (dpiitFilter === 'Not Required' && c.dpiit_required) return false;
      return true;
    });
  }, [challenges, sector, dpiitFilter]);

  return (
    <section id="problems" className="aps-root">
      <div className="landing-section-inner">
        <h2 className="landing-section-title">Active Challenges &amp; RFPs</h2>
        <p className="landing-section-sub">
          Live procurement challenges open for startup bids across Maharashtra departments
        </p>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '60px 0', color: '#64748b' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading live challenges…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="aps-empty">
            <AlertCircle size={32} />
            <p>Could not load challenges: {error}</p>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Make sure the backend server is running.</p>
          </div>
        )}

        {/* Loaded */}
        {!loading && !error && (
          <>
            {/* Filters */}
            <div className="aps-filters">
              <div className="aps-filter-group">
                <Filter size={14} className="aps-filter-icon" />
                <select
                  className="aps-select"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  aria-label="Filter by sector"
                >
                  {allSectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="aps-filter-group">
                <CheckCircle2 size={14} className="aps-filter-icon" />
                <select
                  className="aps-select"
                  value={dpiitFilter}
                  onChange={(e) => setDpiitFilter(e.target.value as typeof dpiitFilter)}
                  aria-label="Filter by DPIIT requirement"
                >
                  {(['All', 'Required', 'Not Required'] as const).map((s) => (
                    <option key={s} value={s}>{s === 'All' ? 'DPIIT: Any' : `DPIIT ${s}`}</option>
                  ))}
                </select>
              </div>

              <span className="aps-count">
                {filtered.length} challenge{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="aps-empty">
                <AlertCircle size={32} />
                <p>
                  {challenges.length === 0
                    ? 'No challenges have been published yet. Check back soon!'
                    : 'No challenges match the current filters.'}
                </p>
              </div>
            )}

            {/* Cards */}
            {filtered.length > 0 && (
              <div className="aps-grid">
                {filtered.map((c) => {
                  const stage = stageLabel(c.status);
                  const stageClass =
                    c.status === 'published' ? 'aps-stage--open' :
                    c.status === 'closed' ? 'aps-stage--closed' :
                    'aps-stage--review';

                  return (
                    <article key={c.id} className="aps-card">
                      {/* Header */}
                      <div className="aps-card-header">
                        <span className="aps-dept-badge">
                          <Tag size={11} /> {c.required_sector}
                        </span>
                        <span className={`aps-stage ${stageClass}`}>{stage}</span>
                      </div>

                      {/* Title & description */}
                      <h3 className="aps-card-title">{c.title}</h3>
                      <p className="aps-card-desc">{c.description}</p>

                      {/* Meta row */}
                      <div className="aps-card-meta">
                        <div className="aps-meta-item">
                          <IndianRupee size={13} />
                          <span>Budget: <strong>{c.budget_band}</strong></span>
                        </div>
                        <DeadlineBadge deadline={c.deadline} />
                        {c.dpiit_required && (
                          <span className="aps-dpiit-badge">
                            <CheckCircle2 size={11} /> DPIIT Required
                          </span>
                        )}
                        {c.created_at && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Added: {new Date(c.created_at).toLocaleDateString('en-IN')}
                          </span>
                        )}
                      </div>

                      {/* CTA */}
                      <button
                        className="aps-cta-btn"
                        onClick={onApply}
                      >
                        Apply / View Details <ArrowRight size={14} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
