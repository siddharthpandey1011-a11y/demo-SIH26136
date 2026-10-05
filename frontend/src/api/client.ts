import type {
  User,
  AuthUser,
  TokenResponse,
  LoginPayload,
  RegisterPayload,
  Startup,
  Challenge,
  Application,
  Evaluation,
  Pilot,
  KPI,
  Evidence,
  Decision,
  DecisionSupport,
  EligibilityResult,
  Milestone,
  Invoice
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private jwtToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string | null) => void)[] = [];

  // ── JWT token management ────────────────────────────────────────────────────
  setToken(token: string | null) {
    this.jwtToken = token;
    // Store in localStorage for persistence across page refreshes
    if (token) {
      localStorage.setItem('jwt_token', token);
    } else {
      localStorage.removeItem('jwt_token');
    }
  }

  getToken(): string | null {
    if (this.jwtToken) {
      return this.jwtToken;
    }
    // Try to restore from localStorage
    const stored = localStorage.getItem('jwt_token');
    if (stored) {
      this.jwtToken = stored;
      return stored;
    }
    return null;
  }

  private onRefreshed(token: string | null) {
    this.refreshSubscribers.forEach(cb => cb(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string | null) => void) {
    this.refreshSubscribers.push(cb);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    } catch (err) {
      throw new Error("Unable to connect to the server. Please check your internet connection.");
    }

    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          // Attempt silent refresh
          const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            // send cookies for refresh token
            credentials: 'include'
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            this.setToken(data.access_token);
            this.onRefreshed(data.access_token);
          } else {
            this.setToken(null);
            this.onRefreshed(null);
            window.dispatchEvent(new Event('auth:logout'));
          }
        } catch (e) {
          this.setToken(null);
          this.onRefreshed(null);
          window.dispatchEvent(new Event('auth:logout'));
        } finally {
          this.isRefreshing = false;
        }
      }
      
      return new Promise<T>((resolve, reject) => {
        this.addRefreshSubscriber(async (token) => {
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            try {
              const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
              if (retryRes.ok) resolve(retryRes.json());
              else reject(new Error('Retry failed'));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error("Session expired. Please log in again."));
          }
        });
      });
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error("Something went wrong. Please try again later.");
      }
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ');
          } else {
            errorMessage = errorData.detail;
          }
        }
      } catch {
        // Fallback to generic statusText
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // ── Auth endpoints ──────────────────────────────────────────────────────────
  async authRegister(payload: RegisterPayload): Promise<TokenResponse> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error("Unable to connect to the server. Please check your internet connection.");
    }
    if (!res.ok) {
      if (res.status >= 500) throw new Error("Something went wrong. Please try again later.");
      const err = await res.json().catch(() => ({}));
      const detail = (err as { detail?: string | any }).detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      } else if (detail && typeof detail === 'object') {
        throw new Error(JSON.stringify(detail));
      }
      throw new Error('Registration failed');
    }
    return res.json() as Promise<TokenResponse>;
  }

  async authLogin(payload: LoginPayload): Promise<TokenResponse> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error("Unable to connect to the server. Please check your internet connection.");
    }
    if (!res.ok) {
      if (res.status >= 500) throw new Error("Something went wrong. Please try again later.");
      const err = await res.json().catch(() => ({}));
      const detail = (err as { detail?: string | any }).detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      } else if (detail && typeof detail === 'object') {
        throw new Error(JSON.stringify(detail));
      }
      throw new Error('Login failed');
    }
    return res.json() as Promise<TokenResponse>;
  }

  async authMe(): Promise<AuthUser> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.jwtToken ? { Authorization: `Bearer ${this.jwtToken}` } : {}),
        },
      });
    } catch (err) {
      throw new Error("Unable to connect to the server. Please check your internet connection.");
    }
    if (!res.ok) {
      if (res.status >= 500) throw new Error("Something went wrong. Please try again later.");
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || 'Authentication failed');
    }
    return res.json() as Promise<AuthUser>;
  }

  async authLogout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      // ignore network errors on logout
    }
  }

  // Users
  getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  getUser(id: number): Promise<User> {
    return this.request<User>(`/users/${id}`);
  }


  // Challenges
  getChallenges(): Promise<Challenge[]> {
    return this.request<Challenge[]>('/challenges');
  }

  getChallenge(id: number): Promise<Challenge> {
    return this.request<Challenge>(`/challenges/${id}`);
  }

  createChallenge(data: Omit<Challenge, 'id' | 'officer_id'>): Promise<Challenge> {
    return this.request<Challenge>('/challenges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Startups & Eligibility
  getMyStartup(): Promise<Startup> {
    return this.request<Startup>('/startups/me');
  }

  getStartup(id: number): Promise<Startup> {
    return this.request<Startup>(`/startups/${id}`);
  }

  getInformationalEligibility(challengeId: number): Promise<EligibilityResult> {
    return this.request<EligibilityResult>(`/startups/eligibility/${challengeId}`);
  }

  // Applications
  getApplications(challengeId?: number, startupId?: number): Promise<Application[]> {
    const params = new URLSearchParams();
    if (challengeId) params.append('challenge_id', String(challengeId));
    if (startupId) params.append('startup_id', String(startupId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<Application[]>(`/applications${qs}`);
  }

  createApplication(challengeId: number, proposalText: string, fileUrl?: string | null): Promise<Application> {
    return this.request<Application>('/applications', {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: challengeId,
        proposal_text: proposalText,
        file_url: fileUrl,
      }),
    });
  }

  updateApplicationStatus(applicationId: number, status: string): Promise<Application> {
    return this.request<Application>(`/applications/${applicationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Evaluations
  createEvaluation(applicationId: number, score: number, notes: string): Promise<Evaluation> {
    return this.request<Evaluation>('/evaluations', {
      method: 'POST',
      body: JSON.stringify({
        application_id: applicationId,
        score,
        notes,
      }),
    });
  }

  // Pilots
  getPilots(): Promise<Pilot[]> {
    return this.request<Pilot[]>('/pilots');
  }

  getPilot(id: number): Promise<Pilot> {
    return this.request<Pilot>(`/pilots/${id}`);
  }

  createPilot(data: {
    application_id: number;
    scope: string;
    timeline_start: string;
    timeline_end: string;
    total_budget?: number;
  }): Promise<Pilot> {
    return this.request<Pilot>('/pilots', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updatePilotBudget(pilotId: number, total_budget: number): Promise<Pilot> {
    return this.request<Pilot>(`/pilots/${pilotId}/budget`, {
      method: 'PATCH',
      body: JSON.stringify({ total_budget }),
    });
  }

  // KPIs
  getPilotKpis(pilotId: number): Promise<KPI[]> {
    return this.request<KPI[]>(`/pilots/${pilotId}/kpis`);
  }

  createKpi(pilotId: number, data: { name: string; target_value: number; unit: string }): Promise<KPI> {
    return this.request<KPI>(`/pilots/${pilotId}/kpis`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Evidence
  getPilotEvidence(pilotId: number): Promise<Evidence[]> {
    return this.request<Evidence[]>(`/pilots/${pilotId}/evidence`);
  }

  submitEvidence(kpiId: number, data: { submitted_value: number; description: string; file_ref?: string }): Promise<Evidence> {
    return this.request<Evidence>(`/kpis/${kpiId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateEvidenceStatus(evidenceId: number, status: 'approved' | 'rejected'): Promise<Evidence> {
    return this.request<Evidence>(`/evidence/${evidenceId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Decision Support & Decisions
  getDecisionSupport(pilotId: number): Promise<DecisionSupport> {
    return this.request<DecisionSupport>(`/pilots/${pilotId}/decision-support`);
  }

  recordDecision(pilotId: number, recommendation: string, notes: string): Promise<Decision> {
    return this.request<Decision>(`/pilots/${pilotId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ recommendation, notes }),
    });
  }

  // Milestones
  listMilestones(pilotId: number): Promise<Milestone[]> {
    return this.request<Milestone[]>(`/pilots/${pilotId}/milestones`);
  }

  createMilestone(pilotId: number, data: { name: string; description: string; percentage_of_budget: number; due_date: string }): Promise<Milestone> {
    return this.request<Milestone>(`/pilots/${pilotId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  releaseMilestone(milestoneId: number, release_notes?: string): Promise<Milestone> {
    return this.request<Milestone>(`/pilots/milestones/${milestoneId}/release`, {
      method: 'PATCH',
      body: JSON.stringify({ release_notes }),
    });
  }

  // Invoices
  submitInvoice(milestoneId: number, data: { amount: number; description: string; file_url?: string | null }): Promise<Invoice> {
    return this.request<Invoice>(`/milestones/${milestoneId}/invoices`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  listInvoices(milestoneId: number): Promise<Invoice[]> {
    return this.request<Invoice[]>(`/milestones/${milestoneId}/invoices`);
  }

  reviewInvoice(milestoneId: number, invoiceId: number, data: { status: 'approved' | 'rejected'; review_notes?: string }): Promise<Invoice> {
    return this.request<Invoice>(`/milestones/${milestoneId}/invoices/${invoiceId}/review`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }


}

export const api = new ApiClient();
