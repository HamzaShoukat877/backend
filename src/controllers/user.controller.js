import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js"; 
import { User } from '../models/user.model.js'
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/fileUpload.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

// Function to generate access and refresh tokens for a user
const genrateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToke = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        // Save refresh token in the database
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToke, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

// Controller for user registration
const registerUser = asyncHandler(async(req, res) => {
    // Extract user details from request body
    const { email, fullName, userName, password } = req.body

    // Validate that all required fields are provided
    if ([fullName, email, userName, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }

    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    })
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }

    // Handle avatar and cover image upload
    const avatarLocalPath = req.files?.avatar[0]?.path
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    // Upload images to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    // Create user in database
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase()
    })

    // Fetch created user without sensitive information
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while creating user")
    }

    // Return success response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
})

// Controller for user login
const loginUser = asyncHandler(async(req, res) => {
    const { email, userName, password } = req.body

    // Validate input
    if (!(email || userName)) {
        throw new ApiError(400, "Username or email is required")
    }

    // Find user in database
    const user = await User.findOne({
        $or: [{ email }, { userName }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }
    
    // Verify password
    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials")
    }

    // Generate tokens
    const { accessToke, refreshToken } = await genrateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    // Set cookie options
    const options = {
        httpOnly: true,
        secure: true,
    }

    // Send response with cookies and user data
    return res.status(200).cookie("accessToken",accessToke,options).cookie("refreshToken",refreshToken,options).json(
        new ApiResponse(200, {accessToken:accessToke, refreshToken:refreshToken, user: loggedInUser}, "User logged in successfully")
    )
})

// Controller for user logout
const logoutUser = asyncHandler(async(req, res) => {
    // Remove refresh token from user document
    
    
    await User.findByIdAndUpdate(
        req.user._id,
        
        {
            $unset: { refreshToken: 1 }
        },
        {
            new: true
        }
    )
    

    const options = {
        httpOnly: true,
        secure: true,
    }

    // Clear cookies and send response
    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out"))
})

// Controller to refresh access token
const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const { accessToken, newRefreshToken } = await genrateAccessAndRefreshTokens(user._id)
    
        return res.status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

// Controller to change user's password
const changeCurrentPassword = asyncHandler(async(req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"))
})

// Controller to get current user's information
const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

// Controller to update user's account details
const updataAccountDetail = asyncHandler(async(req, res) => {
    const { fullName, email } = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        { new: true }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Account details updated successfully"))
})

// Controller to update user's avatar
const updataAvtar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    // Get the current user with their avatar URL
    const currentUser = await User.findById(req.user?._id);
    const oldAvatarUrl = currentUser.avatar;

    // Upload new avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar")
    }

    // Update user with new avatar
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password")

    // Delete old avatar from Cloudinary
    if (oldAvatarUrl) {
        const publicId = oldAvatarUrl.split('/').pop().split('.')[0];
        await deleteFromCloudinary(publicId);
    }

    return res.status(200).json(new ApiResponse(200, user, "Avatar image updated successfully"))
})

// Controller to update user's cover image
const updataConverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password")

    return res.status(200).json(new ApiResponse(200, user, "Cover image updated successfully"))
})

const getUserChannelPorfile = asyncHandler(async(req,res)=> {
    
    const {username} = req.param

    if(!username?.trim()){
        throw new ApiError(400,"user name is missing")
    }

    const channel =  await User.aggregate([
        {
           $match :  {
            username : username?.toLowerCase()
           } 
        },
        {
            $lookup : {
                from : "Subscriptions",
                localField : "_id",
                foreignField : "channel",
                as : "subscribers"
            }
        },
        {
            $lookup : {
                from : "Subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as : "subscriberTo"
            }
        },
        {
            $addFields : {
                subscriberCount : {
                    $size : "$subscribers"
                },
                ChannelSubscribedToCount : {
                    $size : "$subscriberTo"
                },
                isSubscribed : {
                    $cond : {
                        if : {$in : [req.user?._id, "$subscribers.subscriber"]},
                        then : true,
                        else : false
                        
                    }
                }
            }
        },
        {
            $project : {
                fullName : 1,
                username : 1,
                subscriberCount:1,
                ChannelSubscribedToCount:1,
                isSubscribed:1,
                avatar :1,
                coverImage : 1,
                email : 1

            }
        }
    ])
    if(!channel?.length) {
        throw new ApiError (404, "channel does not exist")
    }

    return res
    .status(200)
    .json(200, channel[0],"user channel fetch successfully")

})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await Video.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup : {
                from : "Videos",
                localField : "watchHistory",
                foreignField : "_id",
                as : "watchHistory",
                pipeline : [
                    {
                        $lookup : {
                            from : "Users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        fullName : 1,
                                        username : 1,
                                        avatar : 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    
    return res
    .status(200)
    .json(new ApiResponse(200, user[0].watchHistory, "watch history fetch successfully"))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updataAccountDetail,
    updataAvtar,
    updataConverImage,
    getUserChannelPorfile,
    getWatchHistory
}