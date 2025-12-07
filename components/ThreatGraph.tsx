import React, { useEffect, useRef } from 'react';
import { Incident } from '../types';

// Leaflet will be available globally from the CDN script in index.html

interface ThreatGraphProps {
  incidents: Incident[];
  onSelect: (incident: Incident) => void;
}

const ThreatGraph: React.FC<ThreatGraphProps> = ({ incidents, onSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Default Center: Stanford, CA
  const DEFAULT_CENTER = [37.4275, -122.1697];
  
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Wait for Leaflet to be available (with retry)
    const initMap = () => {
      if (typeof window === 'undefined' || !(window as any).L) {
        // Retry after a short delay if Leaflet isn't loaded yet
        setTimeout(initMap, 100);
        return;
      }

      const L = (window as any).L;
      if (!L) {
        console.error('Leaflet library not loaded. Make sure Leaflet is included in index.html');
        return;
      }

    // Initialize Map if not exists
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 13,
        zoomControl: false, // We'll add it in a specific position if needed, or stick to minimal
        attributionControl: false
      });

      // Add Dark Matter Tiles (CartoDB) - Perfect for B&W professional look
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstanceRef.current);

      // Add Zoom Control bottom-right
      L.control.zoom({
        position: 'bottomright'
      }).addTo(mapInstanceRef.current);
    }

    // Cleanup Markers
    markersRef.current.forEach(marker => mapInstanceRef.current.removeLayer(marker));
    markersRef.current = [];

    // Add Incident Markers
    const bounds = L.latLngBounds([]);
    
    // Always add "You" marker (Stanford) if no incidents or just to show reference
    const stanfordMarker = L.circleMarker(DEFAULT_CENTER, {
      radius: 4,
      fillColor: '#ffffff',
      color: '#ffffff',
      weight: 1,
      opacity: 0.5,
      fillOpacity: 0.8
    }).addTo(mapInstanceRef.current);
    stanfordMarker.bindPopup("<b>STANFORD HQ</b><br>Monitoring Station");
    markersRef.current.push(stanfordMarker);
    bounds.extend(DEFAULT_CENTER);

    // Plot Incidents
    incidents.forEach(incident => {
      const lat = incident.coordinates?.lat || DEFAULT_CENTER[0];
      const lng = incident.coordinates?.lng || DEFAULT_CENTER[1];
      
      const isCritical = incident.severity === 'critical';
      const isHigh = incident.severity === 'high';

      const color = isCritical ? '#ef4444' : isHigh ? '#f59e0b' : '#3b82f6';
      const radius = isCritical ? 10 : 6;

      // Pulse effect for critical incidents
      if (isCritical) {
        const pulseIcon = L.divIcon({
          className: 'marker-pulse',
          iconSize: [40, 40],
          iconAnchor: [20, 20] // Center it
        });
        const pulseMarker = L.marker([lat, lng], { icon: pulseIcon, zIndexOffset: -100 }).addTo(mapInstanceRef.current);
        markersRef.current.push(pulseMarker);
      }

      const marker = L.circleMarker([lat, lng], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(mapInstanceRef.current);

      marker.bindPopup(`
        <div style="min-width: 150px">
          <div style="font-weight: bold; color: ${color}; text-transform: uppercase; margin-bottom: 4px;">${incident.severity} PRIORITY</div>
          <div style="font-size: 12px; margin-bottom: 4px;">${incident.title}</div>
          <div style="font-size: 10px; color: #888;">${incident.location}</div>
        </div>
      `);

      marker.on('click', () => onSelect(incident));
      markersRef.current.push(marker);
      bounds.extend([lat, lng]);
    });

      // Fit bounds to show all incidents + context
      if (incidents.length > 0) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      } else {
        mapInstanceRef.current.setView(DEFAULT_CENTER, 12);
      }
    };

    initMap();

    // Cleanup on unmount
    return () => {
       // We can optionally destroy the map here, but React 18 strict mode double-invokes.
       // Usually better to keep the instance or handle cleanup carefully.
       // mapInstanceRef.current.remove();
    };
  }, [incidents, onSelect]);

  return (
    <div className="w-full h-full relative bg-black" style={{ height: '100%', width: '100%' }}>
      <div id="map" ref={mapContainerRef} className="w-full h-full z-0 outline-none" style={{ height: '100%', width: '100%', minHeight: '400px' }} />
      
      <div className="absolute top-4 left-4 z-[400] pointer-events-none">
        <h3 className="text-white font-bold tracking-widest uppercase text-sm bg-black/80 px-3 py-1 border-l-2 border-white backdrop-blur-md">
          Geospatial Intelligence
        </h3>
        <p className="text-neutral-400 text-[10px] font-mono mt-1 pl-3 bg-black/50 inline-block px-2 py-0.5 backdrop-blur-md">
          Live Tracking • {incidents.length} Signal(s)
        </p>
      </div>
    </div>
  );
};

export default ThreatGraph;