// SPEC §8.6, §7.9b — Settings → 📅 Calendar → 📍 Saved places: one line per place (name, address muted), ＋ Add place,
// and the place form in place of the list (Name, Address, Arrival notes, Match words; Delete for who may change it).
import { useState } from 'react';
import { del, patch, post } from '../api';
import { useApp } from '../state';
import { canChange, cannotChangeText } from '../../../src/shared/roles';
import { EVENT_ADDRESS_MAX } from '../../../src/shared/alert-limits';
import { PLACES_MAX, PLACE_NAME_MAX, PLACE_NOTES_MAX, type Place } from '../../../src/shared/places';
import { usePlaces } from './PlacePicker';
import { useAction } from './useAction';

const NEW = { name: '', address: '', notes: '', words: '' };

function PlaceForm({ place, onDone }: { place: Place | null; onDone: () => void }) {
  const { me, refresh } = useApp();
  const [f, setF] = useState(place ? { name: place.name, address: place.address, notes: place.notes ?? '', words: place.words.join(', ') } : NEW);
  const { run, busy, errorEl } = useAction();
  const canEdit = !place || canChange(place.createdBy, me);
  const set = (k: keyof typeof NEW) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const done = async (fn: () => Promise<unknown>) => { if (await run(fn)) { refresh(); onDone(); } };
  const save = () => done(() => {
    const payload = { name: f.name, address: f.address, notes: f.notes.trim() || null, words: f.words.split(',').map((w) => w.trim()).filter(Boolean) };
    return place ? patch(`/places/${place.id}`, payload) : post('/places', payload);
  });

  return (
    <>
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 4px' }}>{place ? place.name : 'New place'}</h3>
      {errorEl}
      {!canEdit && <p className="muted" style={{ marginBottom: 8 }}>{cannotChangeText('place')}</p>}
      <fieldset disabled={busy || !canEdit} style={{ border: 0, padding: 0 }}>
        <label className="field"><span>Name</span><input value={f.name} maxLength={PLACE_NAME_MAX} onChange={set('name')} placeholder="Incognito SD" /></label>
        <label className="field"><span>Address</span><input value={f.address} maxLength={EVENT_ADDRESS_MAX} onChange={set('address')} /></label>
        <label className="field"><span>Arrival notes (optional)</span><textarea rows={2} value={f.notes} maxLength={PLACE_NOTES_MAX} onChange={set('notes')} placeholder="Where to park, which door" /></label>
        <label className="field"><span>Match words (optional, commas between)</span><input value={f.words} onChange={set('words')} placeholder="Incognito" /></label>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Events whose title or link has one of these words use this place.</p>
      </fieldset>
      <div className="row wrap">
        {canEdit && <button className="primary" disabled={busy || !f.name.trim() || !f.address.trim()} onClick={save}>Save</button>}
        <button disabled={busy} onClick={onDone}>Cancel</button>
        {place && canEdit && <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete “${place.name}”?`)) done(() => del(`/places/${place.id}`)); }}>Delete place</button>}
      </div>
    </>
  );
}

export function Places() {
  const places = usePlaces();
  const [open, setOpen] = useState<Place | 'new' | null>(null);
  if (open) return <PlaceForm place={open === 'new' ? null : open} onDone={() => setOpen(null)} />;
  return (
    <>
      <h3 style={{ fontSize: '.9rem', margin: '16px 0 4px' }}>📍 Saved places</h3>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Addresses a link won't tell Ensō, with how to arrive. An event that names one gets its address and notes.</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
        {places.map((p) => (
          <li key={p.id}>
            <button className="plain" style={{ minHeight: 44, width: '100%', textAlign: 'left' }} onClick={() => setOpen(p)}>
              {p.name} <span className="muted">· {p.address}</span>
            </button>
          </li>
        ))}
      </ul>
      {places.length < PLACES_MAX && <button onClick={() => setOpen('new')}>＋ Add place</button>}
    </>
  );
}
