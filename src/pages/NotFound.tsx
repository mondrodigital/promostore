import { Link } from 'react-router-dom';
import vellumLogo from '../VellumLogo_Horizontal_Artboard 1.svg';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <img src={vellumLogo} alt="Vellum" className="h-12 w-auto mx-auto" />
        <p className="mt-8 text-sm font-semibold tracking-wide text-[#0075AE]">404</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-3 text-gray-600">
          That address is not part of the Vellum Event Items Store.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0075AE] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#005f8c]"
        >
          Back to the store
        </Link>
      </div>
    </div>
  );
}
