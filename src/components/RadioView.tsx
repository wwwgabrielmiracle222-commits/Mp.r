import { useState } from 'react';
import {
  Radio,
  Play,
  Pause,
  Volume2,
  Signal,
  CircleDot,
  Plus,
  ExternalLink,
  Mic,
} from 'lucide-react';
import { RadioStation, AudioTrack } from '../types/audio';

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'mpr_news',
    name: 'MPR News',
    callsign: 'KNOW 91.1 FM',
    genre: 'News & Analysis',
    streamUrl: 'https://newsstream1.mpr.org/news.mp3',
    location: 'St. Paul, Minnesota',
    description: 'Flagship news, in-depth reports, and public discourse from Minnesota Public Radio.',
  },
  {
    id: 'mpr_current',
    name: 'The Current',
    callsign: 'KCMP 89.3 FM',
    genre: 'Indie & Discovery',
    streamUrl: 'https://currentstream1.mpr.org/current.mp3',
    location: 'Minneapolis / St. Paul',
    description: 'Independent music discovery, emerging artists, and live studio sessions by MPR.',
  },
  {
    id: 'mpr_classical',
    name: 'YourClassical MPR',
    callsign: 'KSJN 99.5 FM',
    genre: 'Classical & Symphony',
    streamUrl: 'https://classicalstream1.mpr.org/classical.mp3',
    location: 'Twin Cities, MN',
    description: 'Timeless masterworks, orchestral concerts, and relaxing classical curation.',
  },
  {
    id: 'somafm_groove',
    name: 'Groove Salad',
    callsign: 'SomaFM',
    genre: 'Downtempo Ambient',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    location: 'San Francisco, CA',
    description: 'A nicely chilled plate of ambient/downtempo beats and grooves.',
  },
  {
    id: 'somafm_drone',
    name: 'Drone Zone',
    callsign: 'SomaFM',
    genre: 'Atmospheric Drone',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    location: 'San Francisco, CA',
    description: 'Served best chilled, safe with most medications. Atmospheric ambient textures.',
  },
  {
    id: 'radioparadise_mellow',
    name: 'Radio Paradise',
    callsign: 'RP Mellow',
    genre: 'Eclectic Acoustic',
    streamUrl: 'https://stream.radioparadise.com/mellow-128',
    location: 'Paradise, California',
    description: 'Commercial-free mellow eclectic mix of acoustic, indie, and chill rock.',
  },
];

interface RadioViewProps {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  onTuneStation: (station: RadioStation) => void;
  onTogglePlay: () => void;
}

export function RadioView({
  currentTrack,
  isPlaying,
  onTuneStation,
  onTogglePlay,
}: RadioViewProps) {
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [customStations, setCustomStations] = useState<RadioStation[]>([]);

  const allStations = [...RADIO_STATIONS, ...customStations];
  const isTunedToStation = (station: RadioStation) => {
    return currentTrack?.url === station.streamUrl;
  };

  const handleAddCustomStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl) return;

    const newStation: RadioStation = {
      id: `custom_${Date.now()}`,
      name: customName || 'Custom Web Stream',
      callsign: 'DIRECT',
      genre: 'User Stream',
      streamUrl: customUrl.trim(),
      location: 'Custom Stream URL',
      description: 'Direct audio stream configured by user.',
    };

    setCustomStations([...customStations, newStation]);
    onTuneStation(newStation);
    setCustomUrl('');
    setCustomName('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-[#0D121D] border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <span>Public Radio & Web Streams</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-medium">MPR Network Broadcasts</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">MP.R Radio Tuner</h2>
            <p className="text-xs text-slate-400 max-w-xl mt-1">
              Direct low-latency streams from Minnesota Public Radio (MPR News, The Current, Classical) and premier independent radio stations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Signal className="w-3.5 h-3.5" />
              <span>Live Streams Online</span>
            </span>
          </div>
        </div>
      </div>

      {/* Stations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allStations.map((station) => {
          const isTuned = isTunedToStation(station);
          const isStationActive = isTuned && isPlaying;

          return (
            <div
              key={station.id}
              className={`p-5 rounded-xl border transition-all flex flex-col justify-between ${
                isTuned
                  ? 'bg-amber-400/10 border-amber-400/50 shadow-md shadow-amber-500/5'
                  : 'bg-[#0D121D] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Station Top Row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="font-mono text-amber-400 font-semibold">{station.callsign}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>{station.location}</span>
                    </div>
                    <h3 className="text-base font-bold text-white tracking-tight mt-0.5">
                      {station.name}
                    </h3>
                  </div>

                  {/* Play / Pause Button */}
                  <button
                    onClick={() => {
                      if (isTuned) {
                        onTogglePlay();
                      } else {
                        onTuneStation(station);
                      }
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                      isStationActive
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/30'
                        : isTuned
                        ? 'bg-slate-800 text-amber-400 border border-amber-400/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title={isStationActive ? 'Pause Stream' : 'Tune In'}
                  >
                    {isStationActive ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {station.description}
                </p>
              </div>

              {/* Station Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                <span className="font-medium text-slate-400">{station.genre}</span>
                <span className="font-mono">128 kbps MP3</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Stream URL Tuner */}
      <div className="p-5 rounded-xl bg-[#0D121D] border border-slate-800">
        <h3 className="text-sm font-semibold text-white mb-2">Tune Custom Audio Stream</h3>
        <form onSubmit={handleAddCustomStation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Station Name (e.g. My Favorite Radio)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="sm:w-64 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400"
          />
          <input
            type="url"
            required
            placeholder="Direct Stream URL (e.g. https://.../stream.mp3)"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            Tune & Save
          </button>
        </form>
      </div>
    </div>
  );
}
