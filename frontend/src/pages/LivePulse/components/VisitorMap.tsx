import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Visitor } from '@/hooks/useLiveVisitors'
import { useTheme } from '@/contexts/ThemeContext'

// Fix for default marker icon in react-leaflet
import L from 'leaflet'
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface VisitorMapProps {
  visitors: Visitor[]
  selectedVisitor: Visitor | null
  onVisitorClick: (visitor: Visitor) => void
}

// Custom marker icon with pulse animation
const createPulseIcon = (color: string = '#3b82f6') => {
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="8" fill="${color}" opacity="0.8"/>
        <circle cx="12" cy="12" r="4" fill="white"/>
      </svg>
    `)}`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

function MapUpdater({ selectedVisitor }: { selectedVisitor: Visitor | null }) {
  const map = useMap()

  useEffect(() => {
    if (selectedVisitor && selectedVisitor.latitude && selectedVisitor.longitude) {
      map.setView([selectedVisitor.latitude, selectedVisitor.longitude], 5, {
        animate: true,
        duration: 1,
      })
    }
  }, [selectedVisitor, map])

  return null
}

function ThemeTileLayer({ theme }: { theme: 'light' | 'dark' }) {
  const map = useMap()
  
  useEffect(() => {
    // Forçar atualização do mapa quando o tema mudar
    map.invalidateSize()
  }, [theme, map])

  return (
    <TileLayer
      url={
        theme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      }
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    />
  )
}

export function VisitorMap({ visitors, selectedVisitor, onVisitorClick }: VisitorMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const { theme } = useTheme()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_chat':
        return '#10b981' // green
      case 'navigating':
        return '#3b82f6' // blue
      default:
        return '#6b7280' // gray
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Filtrar visitantes com coordenadas válidas
  const visitorsWithCoords = visitors.filter((v) => {
    const hasCoords = v.latitude != null && v.longitude != null && 
                      !isNaN(v.latitude) && !isNaN(v.longitude) &&
                      v.latitude >= -90 && v.latitude <= 90 &&
                      v.longitude >= -180 && v.longitude <= 180
    if (!hasCoords && v.visitor_id) {
      console.warn(`[VisitorMap] Visitante ${v.visitor_id} sem coordenadas válidas:`, {
        latitude: v.latitude,
        longitude: v.longitude,
        city: v.city,
        country: v.country
      })
    }
    return hasCoords
  })

  // Log para debug
  useEffect(() => {
    console.log('[VisitorMap] Total de visitantes:', visitors.length)
    console.log('[VisitorMap] Visitantes com coordenadas:', visitorsWithCoords.length)
    console.log('[VisitorMap] Visitantes:', visitors.map(v => ({
      id: v.visitor_id,
      lat: v.latitude,
      lng: v.longitude,
      city: v.city,
      country: v.country
    })))
  }, [visitors, visitorsWithCoords.length])

  return (
    <div className="relative w-full h-full bg-background">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        ref={mapRef}
      >
        <ThemeTileLayer theme={theme} />
        <MapUpdater selectedVisitor={selectedVisitor} />
        {visitorsWithCoords.map((visitor) => (
            <Marker
              key={visitor.visitor_id}
              position={[visitor.latitude!, visitor.longitude!]}
              icon={createPulseIcon(getStatusColor(visitor.status))}
              eventHandlers={{
                click: () => onVisitorClick(visitor),
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-semibold text-sm mb-2 text-foreground">
                    {visitor.city || 'Unknown'} {visitor.country ? `, ${visitor.country}` : ''}
                  </h3>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">IP:</span> {visitor.ip || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Página:</span>{' '}
                      {visitor.current_page || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Tempo:</span> {formatDuration(visitor.duration)}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>{' '}
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          visitor.status === 'in_chat'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : visitor.status === 'navigating'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {visitor.status === 'in_chat'
                          ? 'Em Chat'
                          : visitor.status === 'navigating'
                          ? 'Navegando'
                          : 'Inativo'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  )
}

