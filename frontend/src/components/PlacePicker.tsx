// SPEC §7.9b — saved places in a form: usePlaces (GET /places), the 📍 Saved places picker and, when the title names a
// place, a one-tap 📍 Use {name}. Hands the picked place back; holds no form state, never fills by itself.
import { useEffect, useState } from 'react';
import { get } from '../api';
import { useApp } from '../state';
import { matchPlace, type Place } from '../../../src/shared/places';

/** The household's saved places, by name; [] until loaded or when loading fails (the form works without them). */
export function usePlaces(): Place[] {
  const { version } = useApp();
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => { get<Place[]>('/places').then(setPlaces).catch(() => setPlaces([])); }, [version]);
  return places;
}

/** `title`: the field a place's words are looked for in (the suggestion); `address`: what the form holds now. */
export function PlacePicker({ title, address, onPick }: { title: string; address: string; onPick: (place: Place) => void }) {
  const places = usePlaces();
  if (!places.length) return null;
  const named = matchPlace(places, [title]);
  return (
    <div className="row wrap" style={{ marginTop: 4 }}>
      {named && named.address !== address && (
        <button type="button" style={{ minHeight: 44 }} onClick={() => onPick(named)}>📍 Use {named.name}</button>
      )}
      <select aria-label="Saved places" value="" style={{ minHeight: 44, flex: 1 }}
        onChange={(e) => { const p = places.find((x) => x.id === e.target.value); if (p) onPick(p); }}>
        <option value="">📍 Saved places…</option>
        {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}
