const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'queuely',
      resource_type: 'auto',
      ...options,
    };
    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    const streamifier = require('stream').Readable.from(buffer);
    streamifier.pipe(uploadStream);
  });
};

/**
 * Delete a Cloudinary resource by public_id
 */
const deleteResource = (publicId) => cloudinary.uploader.destroy(publicId);

module.exports = { cloudinary, uploadBuffer, deleteResource };
