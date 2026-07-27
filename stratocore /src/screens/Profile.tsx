import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export function Profile() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    country: '',
    state: '',
    cityAddress: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        country: user.country || '',
        state: user.state || '',
        cityAddress: user.cityAddress || ''
      });
    }
  }, [user]);

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Loading profile...</p>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const userRef = doc(db, 'users', user.id);
      await Promise.race([
        updateDoc(userRef, formData),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      await refreshUser();
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      console.warn("Firestore error, falling back to localStorage", err.message);
      
      const localUsers = JSON.parse(localStorage.getItem('users') || '[]');
      const userIndex = localUsers.findIndex((u: any) => u.email === user.email);
      
      if (userIndex !== -1) {
        localUsers[userIndex] = { ...localUsers[userIndex], ...formData };
        localStorage.setItem('users', JSON.stringify(localUsers));
      }
      
      await refreshUser();
      setMessage('Profile updated successfully (local).');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account information and preferences.</p>
      </div>

      {message && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 text-sm rounded-xl border border-green-200 font-medium shadow-sm">
          {message}
        </div>
      )}
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 font-medium shadow-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-slate-100">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl border-4 border-white shadow-md">
            {user.name ? user.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
            <p className="text-slate-500">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Input 
              id="name" 
              name="name" 
              label="Full Name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
            />
            <Input 
              id="phone" 
              name="phone" 
              type="tel" 
              label="Phone Number" 
              value={formData.phone} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Input 
              id="country" 
              name="country" 
              label="Country" 
              value={formData.country} 
              onChange={handleChange} 
              required 
            />
            <Input 
              id="state" 
              name="state" 
              label="State" 
              value={formData.state} 
              onChange={handleChange} 
              required 
            />
          </div>

          <Input 
            id="cityAddress" 
            name="cityAddress" 
            label="City and Address" 
            value={formData.cityAddress} 
            onChange={handleChange} 
            required 
          />

          <div className="pt-4 flex justify-end">
            <Button type="submit" isLoading={loading} className="px-8 py-3 rounded-full">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
