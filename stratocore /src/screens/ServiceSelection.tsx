import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Zap } from 'lucide-react';
import { Button } from '../components/Button';

export function ServiceSelection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-2xl w-full text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Choose Your Service</h1>
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl inline-flex items-center space-x-3 text-sm font-bold shadow-sm">
          <span>📢</span>
          <p>Predictions will be calculated within Excel sheet logic. Choose one:</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-3xl">
        {/* LPG Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
          <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-6">
            <Flame className="w-10 h-10 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-8">LPG</h2>
          <Button 
            className="w-full max-w-[200px] rounded-full" 
            onClick={() => navigate('/service/lpg')}
          >
            Click
          </Button>
        </div>

        {/* Electricity Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
          <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mb-6">
            <Zap className="w-10 h-10 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-8">Electricity</h2>
          <Button 
            className="w-full max-w-[200px] rounded-full"
            onClick={() => navigate('/service/electricity')}
          >
            Click
          </Button>
        </div>
      </div>
    </div>
  );
}
