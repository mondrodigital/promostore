import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Mail, ChevronDown } from 'lucide-react';
// Import ReactQuill and its CSS
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Snow theme CSS
import type Quill from 'quill'; // Import Quill type for editor ref

// Interface matching the DB table structure
interface EmailSettingDB {
  id: number; // DB primary key
  created_at: string;
  template_id: string;
  description: string | null;
  subject: string | null;
  body_html: string | null;
  recipient: string | null;
}

export default function EmailSettings() {
  const [settings, setSettings] = useState<EmailSettingDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({}); // Track saving state per template
  const [error, setError] = useState<string | null>(null);

  // Refs to hold Quill editor instances for each template
  const quillRefs = useRef<Record<string, ReactQuill | null>>({}); 
  // State to manage which placeholder dropdown is open
  const [placeholderDropdownOpen, setPlaceholderDropdownOpen] = useState<Record<string, boolean>>({});

  // Fetch settings from the database
  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('email_settings')
        .select('*')
        .order('template_id'); // Order consistently

      if (fetchError) throw fetchError;
      setSettings(data || []);
    } catch (err: any) {
      console.error('Error fetching email settings:', err);
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Handle changes from ReactQuill
  const handleQuillChange = (templateId: string, htmlContent: string) => {
    setSettings(currentSettings =>
      currentSettings.map(setting =>
        setting.template_id === templateId ? { ...setting, body_html: htmlContent } : setting
      )
    );
  };

  // Handle text input changes (Subject, Recipient)
  const handleInputChange = (templateId: string, field: 'subject' | 'recipient', value: string) => {
    setSettings(currentSettings =>
      currentSettings.map(setting =>
        setting.template_id === templateId ? { ...setting, [field]: value } : setting
      )
    );
  };

  // Handle saving changes for a specific template
  const handleSave = async (templateId: string) => {
    const settingToSave = settings.find(s => s.template_id === templateId);
    if (!settingToSave) return;

    // Don't save recipient if it's the user confirmation template
    const updateData: Partial<EmailSettingDB> = {
      subject: settingToSave.subject,
      body_html: settingToSave.body_html,
      ...(settingToSave.template_id === 'internal_notification' && { recipient: settingToSave.recipient }),
    };

    setSaving(prev => ({ ...prev, [templateId]: true }));
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('email_settings')
        .update(updateData)
        .eq('template_id', templateId);

      if (updateError) throw updateError;
      console.log(`Settings saved for ${templateId}`);
      // Optionally show a success message
      alert(`Settings saved for ${templateId}`); // Simple success alert
    } catch (err: any) {
      console.error(`Error saving settings for ${templateId}:`, err);
      setError(err.message || `Failed to save settings for ${templateId}`);
      // Optionally revert changes on error
      // fetchSettings();
    } finally {
      setSaving(prev => ({ ...prev, [templateId]: false }));
    }
  };

  // Function to insert placeholder into the editor
  const insertPlaceholder = (templateId: string, placeholder: string) => {
    const quillInstance = quillRefs.current[templateId];
    if (quillInstance) {
      const editor = quillInstance.getEditor(); // Get the underlying Quill editor instance
      const range = editor.getSelection(true); // Get current cursor position
      if (range) {
        editor.insertText(range.index, placeholder, 'user'); // Insert placeholder text
        // Move cursor after inserted text
        editor.setSelection(range.index + placeholder.length, 0, 'user'); 
      }
    }
    // Close the dropdown after insertion
    setPlaceholderDropdownOpen(prev => ({...prev, [templateId]: false})); 
  };

  if (loading) {
    return <div className="text-center p-8">Loading email settings...</div>;
  }

  if (error) {
    return <div className="bg-red-100 text-red-700 p-4 rounded-md m-4">{error}</div>;
  }

  // List of available placeholders for reference
  const placeholders = ['{orderId}', '{customerName}', '{customerEmail}', '{pickupDate}', '{returnDate}', '{itemsHtml}'];

  return (
    <div className="space-y-8">
      {settings.map((setting) => (
        <div key={setting.template_id} className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-[#58595B] flex items-center gap-2">
                <Mail className="h-5 w-5 text-gray-400" />
                {setting.description || setting.template_id}
             </h3>
             <button
               onClick={() => handleSave(setting.template_id)}
               disabled={saving[setting.template_id]}
               className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors ${ 
                 saving[setting.template_id]
                   ? 'bg-gray-400 text-white cursor-not-allowed'
                   : 'bg-[#0075AE] text-white hover:bg-[#005f8c]' 
               }`}
             >
               <Save className="h-4 w-4" />
               {saving[setting.template_id] ? 'Saving...' : 'Save Changes'}
             </button>
          </div>

          <div className="mb-4">
            <label htmlFor={`subject-${setting.template_id}`} className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              id={`subject-${setting.template_id}`}
              type="text"
              value={setting.subject || ''}
              onChange={(e) => handleInputChange(setting.template_id, 'subject', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#0075AE] focus:border-[#0075AE]"
            />
          </div>

          {/* Only show editable recipient for internal notification */}
          {setting.template_id === 'internal_notification' && (
            <div className="mb-4">
              <label htmlFor={`recipient-${setting.template_id}`} className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
              <input
                id={`recipient-${setting.template_id}`}
                type="email"
                value={setting.recipient || ''}
                onChange={(e) => handleInputChange(setting.template_id, 'recipient', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#0075AE] focus:border-[#0075AE]"
              />
            </div>
          )}

          {/* Show non-editable recipient info for others */}
          {setting.template_id !== 'internal_notification' && (
             <div className="mb-4">
               <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
               <p className="text-sm text-gray-500 p-2 bg-gray-50 rounded-md border border-gray-200">{setting.template_id === 'user_confirmation' ? 'User who placed the order' : 'N/A'}</p>
             </div>
          )}

          <div className="mb-1">
             <label htmlFor={`body-${setting.template_id}`} className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
             {/* Replace textarea with ReactQuill */}
             <ReactQuill
               ref={(el) => { quillRefs.current[setting.template_id] = el; }} // Assign ref
               theme="snow" // Use the Snow theme (includes toolbar)
               value={setting.body_html || ''}
               onChange={(content) => handleQuillChange(setting.template_id, content)}
               modules={{
                 toolbar: [
                   [{'header': [1, 2, 3, false]}],
                   ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                   [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
                   ['link', 'image'], // Add image/link if needed
                   ['clean'] // Remove formatting button
                 ],
               }}
               className="bg-white" // Ensure editor has a white background
             />
          </div>

          {/* Placeholder Insertion UI */}
          <div className="mt-2 mb-4 relative inline-block text-left">
            <div>
              <button 
                type="button" 
                onClick={() => setPlaceholderDropdownOpen(prev => ({...prev, [setting.template_id]: !prev[setting.template_id]}))}
                className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Insert Placeholder
                <ChevronDown className="-mr-1 ml-2 h-5 w-5" />
              </button>
            </div>

            {/* Dropdown Panel */}
            {placeholderDropdownOpen[setting.template_id] && (
              <div 
                className="origin-top-right absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
              >
                <div className="py-1">
                  {placeholders.map(p => (
                    <button
                      key={p}
                      onClick={() => insertPlaceholder(setting.template_id, p)}
                      className="text-gray-700 block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      ))}
    </div>
  );
}