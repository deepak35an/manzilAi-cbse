export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white font-bold text-lg mb-3">Manzil AI</h3>
            <p className="text-sm">AI-powered adaptive assessment platform for students and organizations.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li>Adaptive Testing</li>
              <li>Voice Evaluation</li>
              <li>Job Readiness</li>
              <li>Analytics Dashboard</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>support@manzilai.com</li>
              <li>+91 9876543210</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-sm text-center">
          &copy; {new Date().getFullYear()} Manzil AI. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
