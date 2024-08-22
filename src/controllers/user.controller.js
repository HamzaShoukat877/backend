import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js"; 
import {User} from '../models/user.model.js'
import { uploadOnCloudinary } from "../utils/fileUpload.js";
import { ApiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler( async(req,res) => {
    //  GET user detail from frontend
    const {email, fullName, userName, password} = req.body

    // validaton - not empty
    if(
        [fullName, email, userName, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required")
    }

    // check if user already exist: username, emial    
    const existedUser = User.findOne({
        $or : [{ userName }, { email }]
    })
    if(existedUser){
        throw new ApiError(409,"User With email or username alerady exist")
    }

    // check for images,check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath =req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    // upload them cloudinary,avatar
    const avatar =  await uploadOnCloudinary(avatarLocalPath)
    const converImage =  await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400,"Avtar files is required")
    }

    // create user object beacuse mongoodb is nosql db
    const user =  await User.create({
        fullName,
        avatar: avatar.url,
        converImage: converImage?.url || "",
        email,
        password,
        userName : userName.toLowerCase()
    })

    // remove passowrd and refresh token from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500,"something went wrong created user")
    }

    // return response
    return res.status(201).json(
        new ApiResponse(200,createdUser,"user register Successfuly")
    )

})

export {registerUser}