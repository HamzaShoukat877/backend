import mongoose,{Schema} from "mongoose";
import jwt from 'jsonwebtoken'
import bcrypt from "bcrypt"

const userSchema = new Schema({
    userName : {
        type : String,
        required : true,
        unique : true,
        lowercase : true,
        trim : true,
        index: true,
    },
    email : {
        type : String,
        required : true,
        unique : true,
        lowercase : true,
        trim : true,
        index: true,
    },
    fullName : {
        type : String,
        required : true,
        trim : true,
        lowercase : true,
    },
    avatar : {
        type : String, //cloudinary url
        required : true,
    },
    coverImage : {
        type : String,
    },
    watchHistory : [
        {
            type : Schema.Types.ObjectId,
            ref : "Video"
        }
    ],
    password : {
        type : String,
        required : [true,'password is required']
    },
    refershToken : {
        type :String,
    }
},{timestamps : true})

userSchema.pre("save", async function(next){
    if(!this.isModified("password")) return next();
    this.password = bcrypt.hash(this.password,10);
    next()
})



export const User = mongoose.model('User',userSchema) 