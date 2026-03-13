'use client';

import { useState, useRef, useEffect } from 'react';

const COUNTRIES = [
    { code: 'BR', flag: '🇧🇷', ddi: '55', name: 'Brasil' },
    { code: 'US', flag: '🇺🇸', ddi: '1',  name: 'EUA' },
    { code: 'PT', flag: '🇵🇹', ddi: '351', name: 'Portugal' },
    { code: 'AR', flag: '🇦🇷', ddi: '54',  name: 'Argentina' },
    { code: 'UY', flag: '🇺🇾', ddi: '598', name: 'Uruguai' },
    { code: 'PY', flag: '🇵🇾', ddi: '595', name: 'Paraguai' },
    { code: 'BO', flag: '🇧🇴', ddi: '591', name: 'Bolívia' },
    { code: 'CL', flag: '🇨🇱', ddi: '56',  name: 'Chile' },
    { code: 'CO', flag: '🇨🇴', ddi: '57',  name: 'Colômbia' },
    { code: 'PE', flag: '🇵🇪', ddi: '51',  name: 'Peru' },
    { code: 'MX', flag: '🇲🇽', ddi: '52',  name: 'México' },
    { code: 'ES', flag: '🇪🇸', ddi: '34',  name: 'Espanha' },
    { code: 'DE', flag: '🇩🇪', ddi: '49',  name: 'Alemanha' },
    { code: 'GB', flag: '🇬🇧', ddi: '44',  name: 'Reino Unido' },
    { code: 'FR', flag: '🇫🇷', ddi: '33',  name: 'França' },
    { code: 'IT', flag: '🇮🇹', ddi: '39',  name: 'Itália' },
    { code: 'JP', flag: '🇯🇵', ddi: '81',  name: 'Japão' },
    { code: 'CN', flag: '🇨🇳', ddi: '86',  name: 'China' },
    { code: 'IN', flag: '🇮🇳', ddi: '91',  name: 'Índia' },
    { code: 'AU', flag: '🇦🇺', ddi: '61',  name: 'Austrália' },
];

interface PhoneInputProps {
    value: string;
    onChange: (fullPhone: string) => void;
    className?: string;
}

export default function PhoneInput({ value, onChange, className = '' }: PhoneInputProps) {
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [localNumber, setLocalNumber] = useState('');
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Sync localNumber from external value (e.g. on mount)
    useEffect(() => {
        if (!value) return;
        const digits = value.replace(/\D/g, '');
        const matched = COUNTRIES.find(c => digits.startsWith(c.ddi));
        if (matched) {
            setSelectedCountry(matched);
            setLocalNumber(digits.slice(matched.ddi.length));
        } else {
            setLocalNumber(digits);
        }
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '');
        setLocalNumber(digits);
        onChange(selectedCountry.ddi + digits);
    };

    const handleSelectCountry = (country: typeof COUNTRIES[0]) => {
        setSelectedCountry(country);
        setOpen(false);
        setSearch('');
        onChange(country.ddi + localNumber);
    };

    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.ddi.includes(search)
    );

    return (
        <div className={`relative flex ${className}`} ref={dropdownRef}>
            {/* Country Selector */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-3 bg-charcoal-bg border border-graphite-border border-r-0 rounded-l-lg text-sm text-crisp-white hover:bg-graphite-600 transition-colors shrink-0"
            >
                <span className="text-lg leading-none">{selectedCountry.flag}</span>
                <span className="text-slate-low text-xs font-mono">+{selectedCountry.ddi}</span>
                <span className="material-symbols-outlined text-slate-low text-sm">expand_more</span>
            </button>

            {/* Number Input */}
            <input
                type="tel"
                placeholder="11999999999"
                value={localNumber}
                onChange={handleNumberChange}
                className="flex-1 min-w-0 bg-charcoal-bg border border-graphite-border rounded-r-lg px-4 py-3 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
            />

            {/* Dropdown */}
            {open && (
                <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-graphite-card border border-graphite-border rounded-lg shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-graphite-border">
                        <input
                            type="text"
                            placeholder="Buscar país..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                            className="w-full bg-charcoal-bg border border-graphite-border rounded-md px-3 py-1.5 text-xs text-crisp-white placeholder:text-slate-low/50 outline-none focus:ring-1 focus:ring-royal-purple"
                        />
                    </div>
                    <ul className="max-h-52 overflow-y-auto">
                        {filtered.map(country => (
                            <li key={country.code}>
                                <button
                                    type="button"
                                    onClick={() => handleSelectCountry(country)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-graphite-600 transition-colors text-left ${
                                        selectedCountry.code === country.code ? 'bg-royal-purple/10 text-royal-purple' : 'text-crisp-white'
                                    }`}
                                >
                                    <span className="text-lg leading-none">{country.flag}</span>
                                    <span className="flex-1 truncate">{country.name}</span>
                                    <span className="text-slate-low font-mono text-xs">+{country.ddi}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
