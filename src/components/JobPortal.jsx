import React, { useState } from 'react';
import { 
  Search, 
  MapPin, 
  Briefcase, 
  DollarSign, 
  Clock, 
  Building2,
  Navigation,
  ArrowRight
} from 'lucide-react';

// Mock Data
const dataLoker = [
  {
    id: 1,
    perusahaan: "PT IP Network Solusindo",
    posisi: "Junior Programmer",
    gaji: "Rp 5.000.000 - Rp 7.000.000",
    lokasi: "Jakarta Selatan",
    pengalaman: "Fresh Graduate",
    tipe: "Full-time"
  },
  {
    id: 2,
    perusahaan: "TechNusa Integra",
    posisi: "Frontend Web Developer",
    gaji: "Rp 6.000.000 - Rp 8.000.000",
    lokasi: "Bandung",
    pengalaman: "1-2 Tahun",
    tipe: "Full-time"
  },
  {
    id: 3,
    perusahaan: "DataNesia Analytics",
    posisi: "Data Entry & Analyst",
    gaji: "Rp 4.500.000 - Rp 5.500.000",
    lokasi: "Remote",
    pengalaman: "Fresh Graduate",
    tipe: "Kontrak"
  },
  {
    id: 4,
    perusahaan: "Sistem Manajemen Warga",
    posisi: "React Developer",
    gaji: "Rp 7.000.000 - Rp 9.000.000",
    lokasi: "Depok",
    pengalaman: "Fresh Graduate",
    tipe: "Full-time"
  }
];

export default function JobPortal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFreshGrad, setFilterFreshGrad] = useState(false);

  const filteredJobs = dataLoker.filter((job) => {
    const matchSearch = job.posisi.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        job.perusahaan.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter = filterFreshGrad ? job.pengalaman === "Fresh Graduate" : true;
    
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 selection:bg-slate-900 selection:text-white">
      <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        
        {/* Simple Header */}
        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 mb-4">
            Portal Lowongan Kerja
          </h1>
          <p className="text-slate-500 text-lg max-w-xl">
            Cari dan temukan peluang karir yang sesuai dengan kemampuan dan minat Anda.
          </p>
        </header>

        {/* Search & Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-2 mb-12 flex flex-col md:row items-center gap-2 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari posisi, perusahaan..." 
              className="w-full pl-11 pr-4 py-3 rounded-lg bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="h-6 w-[1px] bg-slate-200 hidden md:block" />

          <button 
            onClick={() => setFilterFreshGrad(!filterFreshGrad)}
            className={`w-full md:w-auto px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              filterFreshGrad 
                ? "bg-slate-900 text-white" 
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {filterFreshGrad ? "Kategori: Fresh Graduate" : "Semua Pengalaman"}
          </button>
        </div>

        {/* Job List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Lowongan Tersedia ({filteredJobs.length})
            </h2>
          </div>

          {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => (
              <div key={job.id} className="group bg-white border border-slate-200 rounded-xl p-6 hover:border-slate-300 hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-slate-900 group-hover:text-slate-800">
                        {job.posisi}
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold uppercase">
                        {job.tipe}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 font-medium">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      {job.perusahaan}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Navigation className="w-4 h-4" />
                        {job.lokasi}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4" />
                        {job.gaji}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4" />
                        {job.pengalaman}
                      </div>
                    </div>
                  </div>

                  <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors">
                    Detail Pekerjaan
                    <ArrowRight className="w-4 h-4" />
                  </button>

                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">Tidak ada lowongan yang sesuai.</p>
              <button 
                onClick={() => {setSearchTerm(""); setFilterFreshGrad(false);}}
                className="mt-4 text-slate-900 text-sm font-bold hover:underline"
              >
                Reset Filter
              </button>
            </div>
          )}
        </div>

        {/* Simple Footer */}
        <footer className="mt-20 pt-8 border-t border-slate-100 text-center">
          <p className="text-slate-400 text-sm">
            © 2026 Portal Karir Minimalis. Dibuat untuk kenyamanan pencarian kerja.
          </p>
        </footer>

      </div>
    </div>
  );
}
