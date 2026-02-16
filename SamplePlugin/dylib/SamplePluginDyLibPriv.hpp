//
//  SamplePluginDyLibPriv.hpp
//  SamplePluginDyLib
//
//  Created by Björn Eschrich on 16.02.26.
//

/* The classes below are not exported */
#pragma GCC visibility push(hidden)

class SamplePluginDyLibPriv
{
    public:
    void HelloWorldPriv(const char *);
};

#pragma GCC visibility pop
