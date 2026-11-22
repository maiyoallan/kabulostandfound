import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';
import { auth } from '../middleware/auth.js';

const router = Router();
const folder = 'kabu-lost-found';
const transformation = 'q_auto,f_auto';
const allowedFormats = 'jpg,jpeg,png,webp';

router.post('/signature', auth, async (_req, res) => {
  try {
    const { cloud_name, api_key, api_secret } = config.cloudinary;
    if (!cloud_name || !api_key || !api_secret) {
      return res.status(503).json({ error: 'Image storage is not configured.' });
    }

    cloudinary.config(config.cloudinary);
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = { timestamp, folder, transformation, allowed_formats: allowedFormats };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, api_secret);

    res.json({
      timestamp,
      signature,
      cloudName: cloud_name,
      apiKey: api_key,
      folder,
      transformation,
      allowedFormats
    });
  } catch (error) {
    console.error('Cloudinary signature error:', error);
    res.status(500).json({ error: 'Could not prepare image upload.' });
  }
});

export default router;
