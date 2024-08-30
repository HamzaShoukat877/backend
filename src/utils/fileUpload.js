import { v2 as fileUpload } from 'cloudinary';
import fs from 'fs'

fileUpload.config({ 
    cloud_name  : process.env.CLOUDINARY_CLOUD_NAME, 
    api_key     : process.env.CLOUDINARY_API_KEY, 
    api_secret  : process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) return null
        // upload the file on cloudinary
        const response =  await fileUpload.uploader.upload(localFilePath,{
            resource_type : "auto"
        })

        fs.unlinkSync(localFilePath)
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath) //remove the locally saved temporary files as the upload operation got failed
        return null
    }
}

const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return null;
        const result = await fileUpload.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error("Error deleting image from Cloudinary:", error);
        return null;
    }
}

export { uploadOnCloudinary, deleteFromCloudinary }

