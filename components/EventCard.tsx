import React from 'react';
import { Incident } from '../types';
import { getSeverityStyles, formatTimeAgo } from '../constants';
import { MapPin } from 'lucide-react';

interface EventCardProps {
  incident: Incident;
  onClick: (incident: Incident) => void;
  isSelected: boolean;
}

const MinimalEventCard: React.FC<EventCardProps> = ({ incident, onClick, isSelected }) => {
  const { color, border } = getSeverityStyles(incident.severity);

  return (
    <div
      onClick={() => onClick(incident)}
      className={`
        group relative w-full p-6 cursor-pointer transition-all duration-200
        border-l-[3px]
        ${isSelected 
          ? `border-l-white bg-neutral-900` 
          : `border-l-transparent hover:border-l-neutral-700 hover:bg-neutral-900/50`
        }
      `}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          {incident.severity === 'critical' && (
             <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
             </span>
          )}
          <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${color}`}>
            {incident.severity}
          </span>
        </div>
        <span className="text-neutral-600 text-[10px] font-mono">
           {formatTimeAgo(incident.timestamp)}
        </span>
      </div>

      <h3 className={`font-medium text-lg leading-tight mb-3 transition-colors ${isSelected ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>
        {incident.title}
      </h3>

      <div className="flex items-center gap-2 text-neutral-500 text-xs font-mono uppercase tracking-wide">
        <MapPin size={12} />
        <span className="truncate">{incident.location}</span>
      </div>
    </div>
  );
};

export default MinimalEventCard;