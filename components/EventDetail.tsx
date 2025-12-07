import React from 'react';
import { Incident } from '../types';
import { 
  X, 
  MapPin, 
  Zap, 
  User, 
  UserX, 
  UserCheck, 
  MessageSquare, 
  ExternalLink,
  ShieldAlert,
  Globe,
  Heart,
  Repeat2,
  MessageCircle,
  Quote,
  Eye,
  Image as ImageIcon,
  Video,
  TrendingUp
} from 'lucide-react';
import { getSeverityStyles, formatTimeAgo } from '../constants';

interface EventDetailProps {
  incident: Incident;
  onClose: () => void;
}

const ExpandedEventDetail: React.FC<EventDetailProps> = ({ incident, onClose }) => {
  const isCritical = incident.severity === 'critical';
  const shooterStatus = incident.discussion.shooterStatus;
  
  // Dynamic status icon based on the status text returned by Gemini
  let StatusIcon = User;
  let statusColor = 'text-neutral-400';
  let statusBg = 'bg-neutral-800/50';

  const statusLower = shooterStatus.toLowerCase();
  if (statusLower.includes('active') || statusLower.includes('danger')) {
    StatusIcon = UserX;
    statusColor = 'text-red-400';
    statusBg = 'bg-red-950/30 border border-red-900/50';
  } else if (statusLower.includes('resolved') || statusLower.includes('safe')) {
    StatusIcon = UserCheck;
    statusColor = 'text-green-400';
    statusBg = 'bg-green-950/30 border border-green-900/50';
  } else {
    StatusIcon = ShieldAlert;
    statusColor = 'text-blue-400';
    statusBg = 'bg-blue-950/30 border border-blue-900/50';
  }

  const { color } = getSeverityStyles(incident.severity);

  return (
    <div className="h-full flex flex-col bg-neutral-900 border-l border-neutral-800 animate-in slide-in-from-right-10 duration-300">
      {/* Header */}
      <div className="flex justify-between items-start p-8 border-b border-neutral-800">
        <div>
           <div className="flex items-center gap-3 mb-3">
              {isCritical ? <Zap className="w-5 h-5 text-red-500" /> : <Globe className="w-5 h-5 text-neutral-500" />}
              <span className={`text-sm font-mono uppercase tracking-widest ${color}`}>
                {incident.severity} PRIORITY
              </span>
           </div>
           <h2 className="text-3xl font-bold text-white leading-tight">
             {incident.title}
           </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Status Panel */}
        <div className={`p-5 rounded-sm flex items-center gap-5 ${statusBg}`}>
          <StatusIcon className={`w-8 h-8 flex-shrink-0 ${statusColor}`} />
          <div>
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Current Status</p>
            <p className={`text-xl font-medium ${statusColor} capitalize`}>{shooterStatus}</p>
          </div>
        </div>

        {/* Location Context */}
        <div className="flex items-center gap-3 text-neutral-300 bg-neutral-950 p-4 rounded-sm border border-neutral-800">
            <MapPin className="w-5 h-5 text-neutral-500" />
            <span className="font-mono text-sm">{incident.location}</span>
        </div>

        {/* Engagement Metrics */}
        {incident.discussion.totalEngagement && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-5">
            <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Engagement Analytics
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-neutral-400 mb-1">
                  <Heart className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Likes</span>
                </div>
                <span className="text-2xl font-bold text-white">{incident.discussion.totalEngagement.totalLikes.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-neutral-400 mb-1">
                  <Repeat2 className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Retweets</span>
                </div>
                <span className="text-2xl font-bold text-white">{incident.discussion.totalEngagement.totalRetweets.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-neutral-400 mb-1">
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Replies</span>
                </div>
                <span className="text-2xl font-bold text-white">{incident.discussion.totalEngagement.totalReplies.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-neutral-400 mb-1">
                  <Quote className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Quotes</span>
                </div>
                <span className="text-2xl font-bold text-white">{incident.discussion.totalEngagement.totalQuotes.toLocaleString()}</span>
              </div>
            </div>
            {incident.discussion.totalEngagement.totalViews && incident.discussion.totalEngagement.totalViews > 0 && (
              <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-neutral-500" />
                <span className="text-sm text-neutral-400">
                  <span className="text-white font-bold">{incident.discussion.totalEngagement.totalViews.toLocaleString()}</span> total views
                </span>
              </div>
            )}
          </div>
        )}

        {/* Scene/Suspect Images */}
        {incident.discussion.sources.some(post => post.media && post.media.length > 0) && (
          <div>
            <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Scene Images & Media
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {incident.discussion.sources
                .filter(post => post.media && post.media.length > 0)
                .slice(0, 6)
                .flatMap(post => 
                  post.media!.slice(0, 2).map((media, idx) => (
                    <a
                      key={`${post.id}-${idx}`}
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative group aspect-square overflow-hidden rounded-sm border border-neutral-800 hover:border-neutral-600 transition-all"
                    >
                      {media.previewUrl && (
                        <img
                          src={media.previewUrl}
                          alt="Scene image"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-xs text-white truncate">@{post.author.username}</p>
                        </div>
                      </div>
                      {media.type === 'video' && (
                        <div className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5">
                          <Video className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </a>
                  ))
                )}
            </div>
          </div>
        )}

        {/* TLDR Summary */}
        <div>
          <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            TLDR Summary
          </h4>
          <div className="text-neutral-300 leading-relaxed whitespace-pre-line border-l-2 border-neutral-700 pl-6 py-1">
            {incident.discussion.tldrCitations && incident.discussion.tldrCitations.length > 0 ? (
              <div>
                {incident.discussion.userSummary.split(/(\[@[\w]+\]\([^)]+\))/g).map((part, idx) => {
                  const citationMatch = part.match(/\[@([\w]+)\]\(([^)]+)\)/);
                  if (citationMatch) {
                    const [, username, url] = citationMatch;
                    return (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline font-semibold"
                      >
                        @{username}
                      </a>
                    );
                  }
                  return <span key={idx}>{part}</span>;
                })}
              </div>
            ) : (
              <div>{incident.discussion.userSummary}</div>
            )}
          </div>
        </div>

        {/* X Posts */}
        <div>
          <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">
            Real-Time X Posts ({incident.discussion.sources.length})
          </h4>
          {incident.discussion.sources.length > 0 ? (
            <div className="space-y-4">
              {incident.discussion.sources.map((post) => (
                <div 
                  key={post.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 hover:border-neutral-600 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {post.author.profileImageUrl ? (
                        <img
                          src={post.author.profileImageUrl}
                          alt={post.author.name}
                          className="w-8 h-8 rounded-full object-cover border border-neutral-800"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                          <User className="w-4 h-4 text-neutral-500" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{post.author.name}</span>
                          {post.author.verified && (
                            <span className="text-blue-400 text-xs">✓</span>
                          )}
                          <span className="text-xs text-neutral-500">@{post.author.username}</span>
                        </div>
                        <span className="text-xs text-neutral-600">{formatTimeAgo(post.timestamp)}</span>
                      </div>
                    </div>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-600 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  
                  <p className="text-neutral-300 mb-3 leading-relaxed">{post.text}</p>
                  
                  {/* Media */}
                  {post.media && post.media.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {post.media.map((media, idx) => (
                        <a
                          key={idx}
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative group"
                        >
                          {media.previewUrl && (
                            <img
                              src={media.previewUrl}
                              alt="Media"
                              className="w-full h-32 object-cover rounded-sm border border-neutral-800 group-hover:border-neutral-600 transition-colors"
                            />
                          )}
                          <div className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5">
                            {media.type === 'video' ? (
                              <Video className="w-3 h-3 text-white" />
                            ) : (
                              <ImageIcon className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                  
                  {/* Engagement */}
                  <div className="flex items-center gap-4 text-xs text-neutral-500 pt-3 border-t border-neutral-900">
                    <div className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      <span>{post.engagement.likes.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Repeat2 className="w-3 h-3" />
                      <span>{post.engagement.retweets.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      <span>{post.engagement.replies.toLocaleString()}</span>
                    </div>
                    {post.engagement.views && post.engagement.views > 0 && (
                      <div className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span>{post.engagement.views.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-600 text-sm italic">No X posts found for this event.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpandedEventDetail;
