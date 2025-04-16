import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, Mail } from 'lucide-react';

interface EmailSetting {
  id: string;
  setting_name: string;
  enabled: boolean;
  subject_template: string;
  body_template: string;
  recipients: string[];
}

export default function EmailSettings() {
  const [settings, setSettings] = useState<EmailSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('email_settings')
        .select('*')
        .order('setting_name');

      if (fetchError) throw fetchError;
      setSettings(data || []);
    } catch (err: any) {
      console.error('Error fetching email settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (setting: EmailSetting) => {
    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('email_settings')
        .update({
          enabled: setting.enabled,
          subject_template: setting.subject_template,
          body_template: setting.body_template,
          recipients: setting.recipients
        })
        .eq('id', setting.id);

      if (updateError) throw updateError;

      setEditingId(null);
      await fetchSettings();
    } catch (err: any) {
      console.error('Error updating email settings:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addRecipient = (setting: EmailSetting) => {
    if (!newRecipient || !newRecipient.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    const updatedSetting = {
      ...setting,
      recipients: [...setting.recipients, newRecipient]
    };

    handleSave(updatedSetting);
    setNewRecipient('');
  };

  const removeRecipient = (setting: EmailSetting, email: string) => {
    const updatedSetting = {
      ...setting,
      recipients: setting.recipients.filter(r => r !== email)
    };

    handleSave(updatedSetting);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {settings.map(setting => (
        <div key={setting.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">
                  {setting.setting_name.split('_').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={setting.enabled}
                  onChange={() => handleSave({ ...setting, enabled: !setting.enabled })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject Template
                </label>
                <input
                  type="text"
                  value={setting.subject_template}
                  onChange={(e) => setSettings(prev => 
                    prev.map(s => s.id === setting.id ? { ...s, subject_template: e.target.value } : s)
                  )}
                  onBlur={() => handleSave(setting)}
                  className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Template
                </label>
                <textarea
                  value={setting.body_template}
                  onChange={(e) => setSettings(prev => 
                    prev.map(s => s.id === setting.id ? { ...s, body_template: e.target.value } : s)
                  )}
                  onBlur={() => handleSave(setting)}
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Recipients
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {setting.recipients.map(email => (
                    <div
                      key={email}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm"
                    >
                      <span>{email}</span>
                      <button
                        onClick={() => removeRecipient(setting, email)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    placeholder="Enter email address"
                    className="flex-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={() => addRecipient(setting)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}