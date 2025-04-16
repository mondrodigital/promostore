import React from 'react';
import { Copy } from 'lucide-react';

interface EmailPrompt {
  title: string;
  description: string;
  subject: string;
  body: string;
}

const EMAIL_PROMPTS: EmailPrompt[] = [
  {
    title: 'Request Equipment Return',
    description: 'Send this email when you need to request equipment to be returned',
    subject: 'Equipment Return Request',
    body: `Hi [Name],

I hope this email finds you well. I'm reaching out regarding the equipment you currently have checked out.

Could you please return the following items at your earliest convenience:
[List items here]

If you need an extension or have any questions, please let me know.

Best regards,
[Your name]`
  },
  {
    title: 'Equipment Pickup Instructions',
    description: 'Send this email to provide pickup instructions',
    subject: 'Equipment Pickup Instructions',
    body: `Hi [Name],

Your equipment is ready for pickup. Here are the details:

Items:
[List items here]

Pickup Location: [Location]
Available Times: [Times]

Please bring a valid ID when picking up the equipment.

Best regards,
[Your name]`
  },
  {
    title: 'Late Return Notice',
    description: 'Send this email when equipment is overdue',
    subject: 'Overdue Equipment Return Notice',
    body: `Hi [Name],

This is a friendly reminder that the following equipment is currently overdue:
[List items here]

Original Return Date: [Date]

Please return these items as soon as possible or contact us if you need assistance.

Best regards,
[Your name]`
  }
];

export default function EmailPrompts() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {EMAIL_PROMPTS.map((prompt, index) => (
        <div key={index} className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{prompt.title}</h3>
            <p className="text-gray-600 mb-4">{prompt.description}</p>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Subject</label>
                  <button
                    onClick={() => copyToClipboard(prompt.subject)}
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                  {prompt.subject}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Email Body</label>
                  <button
                    onClick={() => copyToClipboard(prompt.body)}
                    className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {prompt.body}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}