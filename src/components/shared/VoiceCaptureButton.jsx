import React from 'react';
import { Link } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VoiceCaptureButton() {
  return (
    <Link to="/captura">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 lg:bottom-8 lg:right-8"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" />
          <div className="relative w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/25 cursor-pointer">
            <Mic className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}