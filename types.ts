export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface XPost {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
    verified?: boolean;
    profileImageUrl?: string;
  };
  url: string;
  timestamp: string;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views?: number;
  };
  media?: XMedia[];
}

export interface XMedia {
  type: 'photo' | 'video' | 'gif';
  url: string;
  previewUrl?: string;
}

export interface TLDRCitation {
  id: number;
  url: string;
  username: string;
}

export interface IncidentDiscussion {
  shooterStatus: string; // Or "Incident Status"
  userSummary: string; // TLDR summary
  tldrCitations?: TLDRCitation[]; // Citations for clickable links
  sources: XPost[];
  totalEngagement: {
    totalLikes: number;
    totalRetweets: number;
    totalReplies: number;
    totalQuotes: number;
    totalViews?: number;
  };
}

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  location: string;
  timestamp: string; // ISO string
  description: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  discussion: IncidentDiscussion;
}

export interface FetchIncidentsResponse {
  incidents: Incident[];
}