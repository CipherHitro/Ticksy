import React, { useState } from 'react';
import { X, Calendar, Plus, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { createCatalogEvent, publishCatalogEvent } from '../../services/api';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: () => void;
}

interface TierFormItem {
  name: string;
  priceINR: number;
  capacity: number;
  seatPrefix: string;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onEventCreated,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'music' | 'comedy' | 'tech' | 'workshop' | 'theatre'>('music');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [state, setState] = useState('Maharashtra');

  // Dates default: tomorrow and day after
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
  const dayAfter = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16);
  const [startsAt, setStartsAt] = useState(tomorrow);
  const [endsAt, setEndsAt] = useState(dayAfter);

  const [tiers, setTiers] = useState<TierFormItem[]>([
    { name: 'General Admission', priceINR: 1999, capacity: 200, seatPrefix: 'GA' },
    { name: 'VIP Pass', priceINR: 4999, capacity: 50, seatPrefix: 'VIP' },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleAddTier = () => {
    const nextPrefixes = ['BAL', 'PIT', 'PLAT', 'GOLD'];
    const prefix = nextPrefixes[tiers.length] || `T${tiers.length + 1}`;
    setTiers([...tiers, { name: 'Tier ' + (tiers.length + 1), priceINR: 2999, capacity: 100, seatPrefix: prefix }]);
  };

  const handleRemoveTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleUpdateTier = (index: number, field: keyof TierFormItem, val: any) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: val };
    setTiers(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title || !description || !venueName || !venueAddress || !city) {
      setError('Please fill in all required event details');
      return;
    }

    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('Event end date/time must be strictly after the start date/time');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        title,
        description,
        category,
        venue: {
          name: venueName,
          address: venueAddress,
          city,
          state,
          country: 'India',
        },
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ticketTiers: tiers.map((t) => ({
          name: t.name,
          description: `${t.name} seat pass`,
          priceMinor: Math.round(Number(t.priceINR) * 100),
          currency: 'INR',
          capacity: Number(t.capacity),
          seatPrefix: t.seatPrefix.toUpperCase(),
        })),
      };

      // 1. Create draft event in Catalog service
      const createRes = await createCatalogEvent(payload);
      if (!createRes.success || !createRes.data) {
        throw new Error(createRes.message || 'Failed to create event in Catalog service');
      }

      const eventId = createRes.data.id || createRes.data._id;

      // 2. Publish event in Catalog service
      const pubRes = await publishCatalogEvent(eventId);
      if (!pubRes.success) {
        throw new Error(pubRes.message || 'Failed to publish event');
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onEventCreated();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Event publishing failed. Please check your network and authorization.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-[#EDE8DD] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden text-[#0B0A08] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#0B0A08]/15 flex items-center justify-between bg-[#EDE8DD]">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#FF4F1F]" />
            <h2 className="font-serif text-2xl font-bold">Publish New Event</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[2px] hover:bg-[#0B0A08]/10 text-[#0B0A08]/70 hover:text-[#0B0A08]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-xs font-mono rounded-[2px]">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm font-mono rounded-[2px] flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Event successfully published to Catalog! Live booking seats generated.</span>
            </div>
          )}

          {/* Basic Details */}
          <div className="space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#0B0A08]/60 font-bold border-b border-[#0B0A08]/10 pb-1">
              1. Event Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  EVENT TITLE *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Coldplay Music of the Spheres"
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  CATEGORY *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none capitalize"
                >
                  <option value="music">Music</option>
                  <option value="comedy">Comedy</option>
                  <option value="tech">Tech</option>
                  <option value="workshop">Workshop</option>
                  <option value="theatre">Theatre</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                DESCRIPTION *
              </label>
              <textarea
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Give attendees a brief overview of this event experience..."
                className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
              />
            </div>
          </div>

          {/* Venue & Location */}
          <div className="space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#0B0A08]/60 font-bold border-b border-[#0B0A08]/10 pb-1">
              2. Venue & Timing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  VENUE NAME *
                </label>
                <input
                  type="text"
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="e.g. DY Patil Stadium"
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  VENUE ADDRESS *
                </label>
                <input
                  type="text"
                  required
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  placeholder="e.g. Sector 7, Nerul"
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  CITY *
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  STATE *
                </label>
                <input
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  STARTS AT *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase text-[#0B0A08]/60 mb-1">
                  ENDS AT *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full bg-[#F5F2EB] border border-[#0B0A08]/20 focus:border-[#FF4F1F] text-[#0B0A08] px-3 py-2 text-xs rounded-[2px] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Ticket Tiers & Capacity */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#0B0A08]/10 pb-1">
              <h3 className="font-mono text-xs uppercase tracking-wider text-[#0B0A08]/60 font-bold">
                3. Ticket Tiers & Pricing
              </h3>
              <button
                type="button"
                onClick={handleAddTier}
                className="text-xs font-mono text-[#FF4F1F] hover:text-[#FF4F1F]/80 flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tier</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {tiers.map((tier, idx) => (
                <div key={idx} className="p-3 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[2px] grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <label className="block font-mono text-[9px] uppercase text-[#0B0A08]/50">Tier Name</label>
                    <input
                      type="text"
                      required
                      value={tier.name}
                      onChange={(e) => handleUpdateTier(idx, 'name', e.target.value)}
                      className="w-full bg-white border border-[#0B0A08]/20 px-2 py-1 text-xs rounded-[2px]"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block font-mono text-[9px] uppercase text-[#0B0A08]/50">Price (₹ INR)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={tier.priceINR}
                      onChange={(e) => handleUpdateTier(idx, 'priceINR', Number(e.target.value))}
                      className="w-full bg-white border border-[#0B0A08]/20 px-2 py-1 text-xs rounded-[2px]"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block font-mono text-[9px] uppercase text-[#0B0A08]/50">Capacity</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={1000}
                      value={tier.capacity}
                      onChange={(e) => handleUpdateTier(idx, 'capacity', Number(e.target.value))}
                      className="w-full bg-white border border-[#0B0A08]/20 px-2 py-1 text-xs rounded-[2px]"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block font-mono text-[9px] uppercase text-[#0B0A08]/50">Prefix</label>
                    <input
                      type="text"
                      required
                      maxLength={4}
                      value={tier.seatPrefix}
                      onChange={(e) => handleUpdateTier(idx, 'seatPrefix', e.target.value.toUpperCase())}
                      className="w-full bg-white border border-[#0B0A08]/20 px-2 py-1 text-xs rounded-[2px] uppercase font-mono"
                    />
                  </div>

                  <div className="col-span-1 flex justify-end pt-3">
                    {tiers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(idx)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Remove tier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-[#0B0A08]/15 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono border border-[#0B0A08]/20 rounded-[2px] hover:bg-[#0B0A08]/5"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || success}
              className="px-6 py-2.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs font-bold rounded-[2px] flex items-center gap-2 shadow"
            >
              <span>{loading ? 'Publishing...' : 'Publish Event Live'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
