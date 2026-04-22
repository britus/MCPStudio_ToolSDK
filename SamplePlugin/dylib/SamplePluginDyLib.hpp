// ===================================================================
//  SamplePluginDyLib.hpp
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================

#ifndef SamplePluginDyLib_
#define SamplePluginDyLib_

/* The classes below are exported */
#pragma GCC visibility push(default)

class SamplePluginDyLib
{
    public:
    void HelloWorld(const char *);
};

#pragma GCC visibility pop
#endif
