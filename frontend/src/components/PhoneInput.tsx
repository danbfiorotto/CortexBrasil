'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const COUNTRIES = [
    { code: 'br', ddi: '55',  name: 'Brasil' },
    { code: 'us', ddi: '1',   name: 'EUA' },
    { code: 'pt', ddi: '351', name: 'Portugal' },
    { code: 'ar', ddi: '54',  name: 'Argentina' },
    { code: 'uy', ddi: '598', name: 'Uruguai' },
    { code: 'py', ddi: '595', name: 'Paraguai' },
    { code: 'bo', ddi: '591', name: 'Bolívia' },
    { code: 'cl', ddi: '56',  name: 'Chile' },
    { code: 'co', ddi: '57',  name: 'Colômbia' },
    { code: 'pe', ddi: '51',  name: 'Peru' },
    { code: 'mx', ddi: '52',  name: 'México' },
    { code: 'es', ddi: '34',  name: 'Espanha' },
    { code: 'de', ddi: '49',  name: 'Alemanha' },
    { code: 'gb', ddi: '44',  name: 'Reino Unido' },
    { code: 'fr', ddi: '33',  name: 'França' },
    { code: 'it', ddi: '39',  name: 'Itália' },
    { code: 'jp', ddi: '81',  name: 'Japão' },
    { code: 'cn', ddi: '86',  name: 'China' },
    { code: 'in', ddi: '91',  name: 'Índia' },
    { code: 'au', ddi: '61',  name: 'Austrália' },
];

function FlagImg({ code, size = 20 }: { code: string; size?: number }) {
    return (
        <img
            src={`https://flagcdn.com/w40/${code}.png`}
            alt={code}
            width={size}
            height={size * 0.75}
            className="rounded-sm object-cover shrink-0"
            style={{ width: size, height: size * 0.75 }}
        />
    );
}

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
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Position dropdown using fixed coordinates from button
    useEffect(() => {
        if (open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: 256,
                zIndex: 9999,
            });
        }
    }, [open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                dropdownRef.current && !dropdownRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
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

    const dropdown = open ? (
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-graphite-card border border-graphite-border rounded-lg shadow-2xl overflow-hidden"
        >
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
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleSelectCountry(country)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-graphite-600 transition-colors text-left ${
                                selectedCountry.code === country.code ? 'bg-royal-purple/10 text-royal-purple' : 'text-crisp-white'
                            }`}
                        >
                            <FlagImg code={country.code} size={20} />
                            <span className="flex-1 truncate">{country.name}</span>
                            <span className="text-slate-low font-mono text-xs">+{country.ddi}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    ) : null;

    return (
        <div className={`relative flex ${className}`}>
            {/* Country Selector */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-3 bg-charcoal-bg border border-graphite-border border-r-0 rounded-l-lg text-sm text-crisp-white hover:bg-graphite-600 transition-colors shrink-0"
            >
                <FlagImg code={selectedCountry.code} size={20} />
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

            {/* Dropdown rendered via portal to escape overflow:hidden parents */}
            {typeof window !== 'undefined' && createPortal(dropdown, document.body)}
        </div>
    );
}
