import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js"; 
import {User} from '../models/user.model.js'
import { uploadOnCloudinary } from "../utils/fileUpload.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken"

const genrateAccessAndRefreshTokens = async(userId) => {
    try {
        const user =  await User.findById(userId)
        const accessToke =  user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        // add refresh token into database
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave : false})

        return {accessToke,refreshToken}

    } catch (error) {
        throw new ApiError(500,"somthing went wrong wilte generating refresh and access token");
        
    }
}

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
    const existedUser = await User.findOne({
        $or : [{ userName }, { email }]
    })
    if(existedUser){
        throw new ApiError(409,"User With email or username alerady exist")
    }


    // check for images,check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path
    

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }


    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    // upload them cloudinary,avatar
    const avatar =  await uploadOnCloudinary(avatarLocalPath)
    const coverImage =  await uploadOnCloudinary(coverImageLocalPath)



    if(!avatar){
        throw new ApiError(400,"Avtar files is required")
    }

    // create user object beacuse mongoodb is nosql db
    const user =  await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
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




const loginUser = asyncHandler( async(req,res) => {
    // get data
    const {email,userName,password} =req.body

    // check email and username
    if(!(email || userName)){
        throw new ApiError(400,"username and email is required")
    }

    // check user have in database
    const getUser = await User.findOne({
        $or:[{email},{userName}]
    })

    if(!getUser){
        throw new ApiError(404,"user does not exist")
    }
    
    // get password
    const isPassowordValid = await getUser.isPasswordCorrect(password)

    if(!isPassowordValid){
        throw new ApiError(404,"Invalid User credentials")
    }

    // get access and refresh token
    const { accessToke , refreshToken } = await genrateAccessAndRefreshTokens(getUser._id)

    const loggedInUser = await User.findById(getUser._id).select("-password -refreshToken")

    // create option for cokie security
    const options = {
        httpOnly : true,
        secure : true,
    }

    // return data and access token
    return res.status(200)
    .cookie("accessToken",accessToke,options)
    .cookie("refreshToken",refreshToken,options)
    .json(new ApiResponse(
        200,
        {
            user : loggedInUser,accessToke,refreshToken
        },
        "User logged In successfully"
    ))
})

const logoutUser = asyncHandler(async(req,res) => {
    User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {refreshToken : undefined}
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly : true,
        secure : true,
    }

    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"user logged out"))

})

const refreshAccessToken = asyncHandler(async(req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(incomingRefreshToken){
        throw new ApiError(401,"unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if(user){
            throw new ApiError(401,"invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh token is expired")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken,newRefreshToken} = await genrateAccessAndRefreshTokens(user._id)
    
        return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken , refreshToken:newRefreshToken},
                "access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "invalid refresh token")
    }
})

export {registerUser,loginUser,logoutUser,refreshAccessToken}