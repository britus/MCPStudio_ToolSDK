// ===================================================================
//  SamplePluginDyLibPriv.hpp
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Lab on 2026.
//  Copyright © 2026 EoF Software Lab. All rights reserved.
// ===================================================================

/* The classes below are not exported */
#pragma GCC visibility push(hidden)

class SamplePluginDyLibPriv
{
    public:
    void HelloWorldPriv(const char *);
};

#pragma GCC visibility pop
