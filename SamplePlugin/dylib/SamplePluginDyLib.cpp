//
//  SamplePluginDyLib.cpp
//  SamplePluginDyLib
//
//  Created by Björn Eschrich on 16.02.26.
//

#include <iostream>
#include "SamplePluginDyLib.hpp"
#include "SamplePluginDyLibPriv.hpp"

void SamplePluginDyLib::HelloWorld(const char * s)
{
    SamplePluginDyLibPriv *theObj = new SamplePluginDyLibPriv;
    theObj->HelloWorldPriv(s);
    delete theObj;
};

void SamplePluginDyLibPriv::HelloWorldPriv(const char * s) 
{
    std::cout << s << std::endl;
};

